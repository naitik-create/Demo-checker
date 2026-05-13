"""
Demo Meeting Transcript Analysis Service
Pure-Python fallback (no PyTorch / NumPy / Transformers required).
Uses OpenAI GPT when OPENAI_API_KEY is set, otherwise uses fast keyword-based analysis.
"""
__version__ = "3.1.2"
import json
import os
import re
from functools import lru_cache


# ─── Helpers ────────────────────────────────────────────────────────────────
def _clamp_int(n: int, lo: int, hi: int) -> int:
    try:
        n = int(n)
    except Exception:
        n = lo
    return max(lo, min(hi, n))


def _chunk_text(text: str, chunk_chars: int = 12000, overlap: int = 600) -> list:
    """
    Split long text into overlapping chunks by characters.
    Keeps chunk boundaries stable even without sentence tokenization libs.
    """
    t = (text or "").strip()
    if not t:
        return []
    chunk_chars = _clamp_int(chunk_chars, 2000, 40000)
    overlap = _clamp_int(overlap, 0, max(0, chunk_chars // 2))
    if len(t) <= chunk_chars:
        return [t]
    out = []
    i = 0
    while i < len(t):
        out.append(t[i : i + chunk_chars])
        if i + chunk_chars >= len(t):
            break
        i += max(1, chunk_chars - overlap)
        if len(out) >= 12:  # keep cost bounded
            break
    return out


def _sentiment_sample(text: str, window: int = 3500) -> str:
    """
    Build a representative sample across the transcript (start/middle/end)
    instead of only the first N chars.
    """
    t = (text or "").strip()
    if not t:
        return ""
    window = _clamp_int(window, 800, 8000)
    if len(t) <= window:
        return t
    a = t[:window]
    mid_start = max(0, (len(t) // 2) - (window // 2))
    b = t[mid_start : mid_start + window]
    c = t[-window:]
    return "\n\n".join([a, b, c])

def _detect_questions(text: str) -> list:
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    questions = [l for l in lines if "?" in l]
    if questions:
        return questions[:20]
    pattern = re.compile(r"\b(what|why|how|when|where|who|can you|could you|do you|does it)\b", re.I)
    return [l for l in lines if pattern.search(l)][:20]


def _detect_client_name(text: str) -> str:
    """Try to extract a client/company name from the transcript."""
    patterns = [
        r"(?:demo\s+for|meeting\s+with|speaking\s+with|talking\s+to|client\s+is|company\s+is|from)\s+([A-Z][A-Za-z\s&.]{2,30}?)(?:\s*[,.\n]|$)",
        r"(?:Hello|Hi|Good\s+(?:morning|afternoon|evening)),?\s+([A-Z][A-Za-z\s]{2,25}?)(?:\s*[,.\n!]|$)",
        r"([A-Z][A-Za-z\s&.]{2,30}?)\s+(?:team|company|organization|corp|inc|ltd)",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            name = m.group(1).strip()
            generic = {"The", "Our", "Your", "This", "That", "These", "We", "I", "You"}
            if name and name.split()[0] not in generic and len(name) > 2:
                return name
    return ""

def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _split_sentences(text: str) -> list:
    t = _norm(text)
    if not t:
        return []
    parts = re.split(r"(?<=[.!?])\s+", t)
    out = []
    for s in parts:
        s = s.strip()
        if 18 <= len(s) <= 320:
            out.append(s)
    return out


def _keyword_count(text: str, patterns: list) -> int:
    t = text or ""
    return sum(len(re.findall(p, t, flags=re.I)) for p in patterns)


def _extract_signals(text: str) -> dict:
    """
    Extract non-ML signals from transcript to synthesize insights.
    Accepts raw transcript (may be VTT format) and handles both formats.
    Speaker-role splitting uses the raw text; keyword detection uses cleaned text.
    """
    raw = text or ""
    # Clean VTT tags for keyword detection (so <v Speaker> tags don't affect search)
    t = _clean_vtt(raw)
    signals = {}

    # Core topics (on clean text)
    signals["has_pricing"] = bool(re.search(r"\b(pricing|price|cost|budget|roi|expensive|license)\b", t, re.I))
    signals["has_security"] = bool(re.search(r"\b(security|compliance|soc\s*2|iso|gdpr|hipaa|risk)\b", t, re.I))
    signals["has_integration"] = bool(re.search(r"\b(integration|integrate|api|webhook|sso|oauth|azure|okta|salesforce|crm|erp)\b", t, re.I))
    signals["has_timeline"] = bool(re.search(r"\b(timeline|when|by\s+\w+day|this\s+week|next\s+week|month|quarter|deadline)\b", t, re.I))
    signals["has_next_steps"] = bool(re.search(r"\b(next\s+step|follow[-\s]?up|send\s+(a\s+)?proposal|pilot|poc|trial|schedule|book|calendar|demo\s+again)\b", t, re.I))
    signals["has_competitor"] = bool(re.search(r"\b(competitor|alternative|versus|vs\.?|compare|already\s+use|currently\s+using|intune|glpi|servicenow|jira|zendesk|splunk|datadog)\b", t, re.I))
    signals["has_decision"] = bool(re.search(r"\b(decision|approve|sign[-\s]?off|procurement|legal|stakeholder)\b", t, re.I))

    # Discovery / structure
    signals["mentions_pain"] = bool(re.search(r"\b(problem|challenge|pain\s+point|issue|currently|today\s+we)\b", t, re.I))
    signals["mentions_use_case"] = bool(re.search(r"\b(use\s+case|workflow|scenario|example|case\s+study)\b", t, re.I))
    signals["mentions_value"] = bool(re.search(r"\b(value|benefit|outcome|impact|save\s+time|reduce|increase)\b", t, re.I))

    # Engagement cues (non-sentiment) — use cleaned text for question detection
    signals["questions"] = _detect_questions(t)
    signals["questions_count"] = len(signals["questions"])

    # Speaker-role splitting: use raw text (handles both VTT and standard formats)
    pairs = _parse_speaker_lines(raw)
    if pairs:
        _, p_text, c_text, word_counts = _split_roles(pairs)
        total_words = sum(word_counts.values())
        presenter_words = max(word_counts.values()) if word_counts else 0
        client_words = total_words - presenter_words
        total = max(1, total_words)
        signals["client_talk_ratio"] = round(client_words / total, 3)
        # presenter_text and client_text are already clean (VTT tags stripped by _parse_speaker_lines)
        signals["presenter_text"] = p_text
        signals["client_text"] = c_text
    else:
        signals["client_talk_ratio"] = None
        signals["presenter_text"] = t
        signals["client_text"] = ""

    return signals


def _clean_vtt(text: str) -> str:
    """Strip VTT/WebVTT XML tags and timestamp lines from transcript text."""
    t = text or ""
    # Remove <v Speaker>...</v> tags (keep the text inside)
    t = re.sub(r'<v\s+[^>]+>(.*?)</v>', r'\1 ', t, flags=re.DOTALL)
    # Remove any remaining XML/HTML tags
    t = re.sub(r'<[^>]+>', ' ', t)
    # Remove WebVTT timestamp lines like "00:01:23.456 --> 00:01:25.789"
    t = re.sub(r'\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}', ' ', t)
    # Remove WEBVTT header
    t = re.sub(r'^WEBVTT\b.*', ' ', t, flags=re.MULTILINE)
    return re.sub(r'\s+', ' ', t).strip()


def _parse_speaker_lines(text: str) -> list:
    """
    Parse transcript into [(speaker, utterance)].
    Supports:
      1. Teams VTT format: <v Speaker Name>text</v>
      2. Standard format: "Name: text"
    """
    pairs = []

    # Try Teams VTT format first: <v Speaker Name>text</v>
    vtt_matches = re.findall(r'<v\s+([^>]+?)>(.*?)</v>', text or "", re.DOTALL)
    if vtt_matches:
        for speaker, utterance in vtt_matches:
            # Strip nested tags (e.g. <lang>) from utterance
            utterance = re.sub(r'<[^>]+>', '', utterance).strip()
            speaker = speaker.strip()
            if speaker and utterance:
                pairs.append((speaker, utterance))
        return pairs

    # Fallback: standard "Name: text" format
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^([A-Za-z][A-Za-z0-9 _\-]{1,30})\s*:\s*(.+)$", line)
        if m:
            speaker = m.group(1).strip()
            utter = m.group(2).strip()
            pairs.append((speaker, utter))
        else:
            if pairs:
                pairs[-1] = (pairs[-1][0], (pairs[-1][1] + " " + line).strip())
            else:
                pairs.append(("", line))
    return pairs


def _split_roles(pairs: list) -> tuple:
    """
    Identify presenter vs clients by word count.
    The speaker with the most words = presenter/consultant.
    Returns (presenter_name, presenter_text, client_text, word_counts_dict).
    """
    word_counts: dict = {}
    speaker_texts: dict = {}
    for speaker, utterance in (pairs or []):
        w = len(utterance.split())
        word_counts[speaker] = word_counts.get(speaker, 0) + w
        speaker_texts.setdefault(speaker, []).append(utterance)

    if not word_counts:
        return "", "", "", {}

    presenter = max(word_counts, key=word_counts.__getitem__)
    p_text = " ".join(speaker_texts[presenter])
    c_text = " ".join(
        " ".join(utts) for sp, utts in speaker_texts.items() if sp != presenter
    )
    return presenter, p_text, c_text, word_counts


def _detect_product_name(text: str) -> str:
    """
    Try to detect which product the demo is about.
    Strategy:
    - If PRODUCT_CATALOG env is set (comma-separated), pick the most-mentioned.
    - Else infer from phrases like "our product X", "product called X", "platform X".
    """
    t = text or ""
    catalog = [p.strip() for p in (os.getenv("PRODUCT_CATALOG", "")).split(",") if p.strip()]
    if catalog:
        best = ("", 0)
        for p in catalog:
            cnt = len(re.findall(rf"\\b{re.escape(p)}\\b", t, flags=re.I))
            if cnt > best[1]:
                best = (p, cnt)
        if best[1] > 0:
            return best[0]

    patterns = [
        r"(?:our\s+(?:product|platform|solution)\s+(?:is\s+)?(?:called\s+)?)\s*([A-Z][A-Za-z0-9 &._-]{2,40})",
        r"(?:product|platform|solution)\s+(?:name\s+is|called)\s*([A-Z][A-Za-z0-9 &._-]{2,40})",
        r"\\b([A-Z][A-Za-z0-9]{2,24})\\b\\s+(?:platform|suite|cloud)\\b",
    ]
    for pat in patterns:
        m = re.search(pat, t)
        if m:
            name = m.group(1).strip().strip(".,")
            if len(name) >= 3:
                return name
    return ""


def _extract_qa_pairs(text: str) -> list:
    """
    Extract sequential Q&A pairs (client question -> consultant answer).
    Output: [{question, answer, tip}]
    """
    pairs = _parse_speaker_lines(text)
    if not pairs:
        return []

    def is_client(s: str) -> bool:
        s = (s or "").lower()
        return "client" in s or "customer" in s or "prospect" in s

    def is_consultant(s: str) -> bool:
        s = (s or "").lower()
        return "consultant" in s or "presenter" in s or "sales" in s

    q_pat = re.compile(r"\\?|\\b(what|why|how|when|where|who|can you|could you|do you|does it|is it|are you)\\b", re.I)

    out = []
    i = 0
    while i < len(pairs):
        speaker, utter = pairs[i]
        if is_client(speaker) and q_pat.search(utter):
            question = utter.strip()
            # collect answer from subsequent consultant lines until next client question
            ans_parts = []
            j = i + 1
            while j < len(pairs):
                sp2, ut2 = pairs[j]
                if is_client(sp2) and q_pat.search(ut2):
                    break
                if is_consultant(sp2) or (sp2 == "" and ans_parts):
                    ans_parts.append(ut2.strip())
                j += 1

            answer = " ".join(ans_parts).strip()
            tip = ""
            if not answer:
                tip = "Answer this question explicitly and confirm the client is satisfied before moving on."
            else:
                if len(answer) < 30:
                    tip = "Provide a more detailed answer with an example and confirm next steps."
                elif re.search(r"i\\s+will|we\\s+will|let\\s+me|follow\\s*up|get\\s+back", answer, re.I):
                    tip = "If you promise a follow-up, assign an owner and date/time to close the loop."
                else:
                    tip = "Summarize the answer in one sentence and link it to the client’s goal."

            out.append({"question": question, "answer": answer, "tip": tip})
            if len(out) >= 20:
                break
            i = j
            continue
        i += 1

    return out


def _extract_summary(text: str) -> str:
    """
    Synthesize a structured summary from the whole transcript.
    This is intentionally NOT quoting transcript lines; it produces higher-level "what happened" bullets.
    """
    t = (text or "").strip()
    if not t:
        return "No summary available."

    signals = _extract_signals(t)
    sent_obj = _sentiment_score_rule_based(t)
    sent = sent_obj.get("label", "neutral")

    q_count = int(signals.get("questions_count") or 0)
    has_pain = bool(signals.get("mentions_pain"))
    has_value = bool(signals.get("mentions_value"))

    lines = []
    lines.append(f"- **Context**: Transcript indicates a demo/workflow discussion with an overall {sent} tone.")

    if has_pain:
        lines.append("- **Client needs**: Pain/problem + requirements were discussed as drivers for the demo.")
    else:
        lines.append("- **Client needs**: Clear pain/problem framing was limited; some requirements may be implicit.")

    if has_value:
        lines.append("- **Value**: Outcomes/benefits were mentioned (what changes for the client).")
    else:
        lines.append("- **Value**: Business outcomes were not strongly articulated; value link may need strengthening.")

    if signals.get("has_integration"):
        lines.append("- **Technical fit**: Integrations / APIs / SSO or platform connectivity were part of the conversation.")
    else:
        lines.append("- **Technical fit**: Core technical fit was discussed, but integration depth was limited in the transcript.")

    if signals.get("has_security"):
        lines.append("- **Risk & compliance**: Security/compliance topics came up (expect follow-up questions).")

    if signals.get("has_pricing"):
        lines.append("- **Commercials**: Pricing/cost/budget/ROI were discussed (or at least mentioned).")
    else:
        lines.append("- **Commercials**: Pricing clarity was not captured; expect a separate commercial discussion.")

    if q_count > 0:
        lines.append(f"- **Engagement**: Client asked {q_count} question(s) (active evaluation).")
    else:
        lines.append("- **Engagement**: Few explicit questions detected; confirm alignment with additional discovery prompts.")

    if signals.get("has_next_steps"):
        lines.append("- **Momentum & next steps**: Follow-ups were mentioned (proposal/pilot/POC/schedule).")
    else:
        lines.append("- **Momentum & next steps**: Next steps were not explicit (owner/date/action likely missing).")

    return "\n".join(lines)


def _analyze_sentiment(text: str) -> str:
    """Pure keyword-based sentiment analysis (fast fallback)."""
    pos_words = re.compile(
        r"\b(great|excellent|good|love|perfect|amazing|awesome|helpful|clear|"
        r"impressed|fantastic|happy|satisfied|valuable|interested|yes|sure|absolutely)\b", re.I
    )
    neg_words = re.compile(
        r"\b(bad|poor|confuse|unclear|concern|issue|problem|complicated|expensive|"
        r"difficult|slow|disappointing|not\s+sure|worried|hesitant)\b", re.I
    )
    pos_count = len(pos_words.findall(text))
    neg_count = len(neg_words.findall(text))
    if pos_count > neg_count * 1.5:
        return "positive"
    if neg_count > pos_count * 1.5:
        return "negative"
    return "neutral"


@lru_cache(maxsize=1)
def _sentiment_pipeline():
    """
    High-accuracy local sentiment (no OpenAI required).
    Uses HuggingFace Transformers pipeline if available.
    """
    try:
        from transformers import pipeline  # type: ignore
    except Exception:
        return None
    try:
        return pipeline(
            "sentiment-analysis",
            model=os.getenv("SENTIMENT_MODEL", "distilbert-base-uncased-finetuned-sst-2-english"),
        )
    except Exception:
        return None


def _analyze_sentiment_high_accuracy(text: str) -> str:
    """
    Prefer Transformers sentiment if enabled; otherwise fallback to keyword sentiment.
    """
    use_local = os.getenv("USE_TRANSFORMERS_SENTIMENT", "1").lower() not in ("0", "false", "no")
    if use_local:
        pipe = _sentiment_pipeline()
        if pipe is not None:
            try:
                sample = _sentiment_sample(text, window=3500)
                out = pipe(sample)
                if isinstance(out, list) and out:
                    label = (out[0].get("label") or "").upper()
                    score = float(out[0].get("score") or 0.0)
                    if label.startswith("POS") and score >= 0.60:
                        return "positive"
                    if label.startswith("NEG") and score >= 0.60:
                        return "negative"
                    return "neutral"
            except Exception:
                pass
    return _analyze_sentiment(text)


def _sentiment_score_rule_based(text: str) -> dict:
    """
    Higher-level sentiment without paid APIs.
    Produces overall label plus rationale and a simple timeline.
    """
    t = (text or "").strip()
    if not t:
        return {"label": "neutral", "score": 0.0, "timeline": ["neutral", "neutral", "neutral"], "rationale": []}

    # Weighted cues (commitment vs hesitation)
    pos = [
        r"\b(sounds\s+good|looks\s+good|makes\s+sense|great|excellent|love|impressed)\b",
        r"\b(interested|excited|keen|yes|absolutely|definitely|let.s\s+do)\b",
        r"\b(move\s+forward|next\s+step|send\s+proposal|schedule|book)\b",
    ]
    neg = [
        r"\b(concern|risk|issue|problem|unclear|confus|not\s+sure|hesitat)\b",
        r"\b(expensive|too\s+much|budget)\b",
        r"\b(can.t|cannot|won.t|blocker|deal\s*breaker)\b",
    ]
    neutralizers = [
        r"\b(let\s+me\s+think|we.ll\s+review|get\s+back|follow\s+up)\b",
    ]

    def score_chunk(ch: str) -> float:
        p = _keyword_count(ch, pos)
        n = _keyword_count(ch, neg)
        z = _keyword_count(ch, neutralizers)
        return (p * 2.0) - (n * 2.2) - (z * 0.6)

    sample = _sentiment_sample(t, window=3500)
    chunks = sample.split("\n\n")
    while len(chunks) < 3:
        chunks.append(chunks[-1] if chunks else "")
    chunks = chunks[:3]
    scores = [score_chunk(c) for c in chunks]
    total = sum(scores)

    timeline = []
    for sc in scores:
        if sc >= 2.0:
            timeline.append("positive")
        elif sc <= -2.0:
            timeline.append("negative")
        else:
            timeline.append("neutral")

    if total >= 3.0:
        label = "positive"
    elif total <= -3.0:
        label = "negative"
    else:
        label = "neutral"

    rationale = []
    if label == "positive":
        rationale.append("Overall language indicates interest/forward motion.")
    elif label == "negative":
        rationale.append("Overall language indicates concerns/hesitation.")
    else:
        rationale.append("Mixed or informational tone with limited commitment signals.")

    return {"label": label, "score": float(round(total, 2)), "timeline": timeline, "rationale": rationale}


def _extract_pros_cons_tips(text: str, questions: list, sentiment: str) -> tuple:
    """
    Produce pros/cons/tips mapped to the 7 dimensions (Discovery, Rapport, Demo, Objections, Engagement, Close, Risks).
    """
    signals = _extract_signals(text)
    q_count = int(len(questions) or signals.get("questions_count") or 0)
    
    pros = []
    cons = []
    tips = []

    # 1. DISCOVERY
    if signals.get("mentions_pain"):
        pros.append("Discovery: Successfully identified client pain points and business challenges.")
    else:
        cons.append(_make_con("Discovery", "Pain identification",
            "Pain was mentioned generically but not quantified or confirmed by the prospect before the demo began.",
            "Before demoing, ask: 'What does a bad week look like for your team? How many hours are lost to manual monitoring?' Confirm pain before showing any product."))
        tips.append(_make_tip("Pain identification", [
            "1. Ask 3 targeted pain questions before showing any product — e.g. 'What business impact does this monitoring gap have on your SLA or uptime targets?'",
            "2. Quantify the pain — e.g. 'How many hours per week does your team spend triaging alerts manually?'",
            "3. Confirm pain before demoing — e.g. 'So if I understand correctly, your main pain is X — is that right? Let me show you how Motadata solves exactly that.'"
        ]))
        cons.append(_make_con("Discovery", "Current infra and state mapping",
            "No mapping of the prospect's existing tools, infrastructure type, or team size before the demo.",
            "Add an infra snapshot step: 'Can you walk me through what monitoring and ITSM tools you're currently running?' Capture in monday.com before accepting any demo."))
        tips.append(_make_tip("Current infra and state mapping", [
            "1. Ask before every demo: 'Can you walk me through what monitoring and ITSM tools you're currently running — on-prem or cloud?'",
            "2. Capture current tools, infra type, and team size in monday.com before accepting the demo invite.",
            "3. Use the infra snapshot to decide which modules to show — e.g. show HIM if on-prem infra gaps are confirmed."
        ]))

    # 2. RAPPORT
    if sentiment == "positive":
        pros.append("Rapport: Positive sentiment and strong engagement signals detected.")
    else:
        cons.append(_make_con("Rapport", "Agenda setting",
            "No agenda was set at the start. Topics drifted unpredictably without a declared structure.",
            "Open every call with a visible agenda: 'We have 45 minutes — 15 min discovery, 20 min demo, 10 min Q&A. Does that work for you?'"))
        tips.append(_make_tip("Agenda setting", [
            "1. Open every call by stating the agenda — e.g. 'Today: (1) Discovery 15 min, (2) Demo 20 min, (3) Q&A 10 min. Agreed?'",
            "2. Share the agenda in the calendar invite so the prospect arrives prepared.",
            "3. Check in at the halfway point: 'We've covered discovery — does the agenda still work for you?'"
        ]))
        cons.append(_make_con("Rapport", "Active listening signals",
            "Responses were mostly echo/repeat-back without genuine acknowledgment or follow-up probing.",
            "Replace mirroring with acknowledgment + building: 'That makes sense — and that connects to what you mentioned about delayed alerts...'"))
        tips.append(_make_tip("Active listening signals", [
            "1. Paraphrase before moving on — e.g. 'So if I understand correctly, your main challenge is alert noise causing missed incidents — is that right?'",
            "2. Ask a follow-up based on what was said — e.g. 'You mentioned SLA breaches — how often does that happen in a typical month?'",
            "3. Adjust demo direction in response to feedback — 'Since you mentioned X, let me show you that module first.'"
        ]))

    # 3. DEMO
    if signals.get("has_integration") or signals.get("has_security"):
        pros.append("Demo: Technical relevance was high, addressing integration and compliance needs.")
    else:
        cons.append(_make_con("Demo", "Relevance of demo flow",
            "Demo flow was generic or unstructured; features shown did not map to the stated customer pains.",
            "Only show modules that map to discovered pain — e.g. 'Since you mentioned SLA breaches, let me show exactly how Motadata auto-escalates before a breach happens.'"))
        tips.append(_make_tip("Relevance of demo flow", [
            "1. Map every demo module to a discovered pain — e.g. show HIM if infra monitoring pain was raised, Service Desk if SLA issues mentioned.",
            "2. Reference pain back during demo: 'You mentioned earlier that alerts took 4 hours to surface — here's how that drops to 20 minutes.'",
            "3. Avoid feature tours — every module shown must answer 'so what?' with a business outcome for this specific customer."
        ]))
        cons.append(_make_con("Demo", "Story-based narrative",
            "No clear story arc linking customer pain to product capability to business outcome.",
            "Use a 3-act structure: 'You told us X pain → here's how Motadata solves it → here's the outcome you'd see in 90 days.'"))
        tips.append(_make_tip("Story-based narrative", [
            "1. Use a 3-act arc — e.g. 'Your team misses SLA breaches because alerts arrive 4 hours late. Here's how Motadata changes that. Here's what your NOC looks like 90 days later.'",
            "2. Reference the customer's specific pain in every act — not 'customers see 40% reduction' but 'your team would see...'",
            "3. End with an outcome statement: 'The result is your team spends 20 minutes on triage instead of 4 hours — that's 3 FTE hours saved per day.'"
        ]))
        tips.append(_make_tip("Value articulation", [
            "1. Quantify the outcome — e.g. 'Customers using this see a 40% reduction in MTTR and save roughly 3 FTE hours per day on manual triage.'",
            "2. Create a Value Phrase Bank — 10 outcome-focused sentences per vertical. 'Your team spends less time fire-fighting' not 'we have unified dashboards.'",
            "3. Connect every feature to a business outcome: 'This auto-correlation means your L1 team stops spending 2 hours per incident manually correlating logs.'"
        ]))

    # 4. OBJECTIONS
    if signals.get("has_competitor"):
        cons.append(_make_con("Objections", "Competitor handling",
            "Competitor mentions present but no structured differentiation or Motadata-specific positioning used.",
            "Acknowledge the competitor then pivot — e.g. 'Datadog is strong on cloud APM. Where Motadata wins is unified on-prem + cloud with device-based pricing.'"))
        tips.append(_make_tip("Competitor handling", [
            "1. Name the competitor, acknowledge it respectfully, then differentiate — e.g. 'Datadog is strong on cloud APM. Where Motadata wins is on-prem + cloud unified, device-based pricing.'",
            "2. Turn the competitor mention into a discovery question: 'What gaps have you seen with Datadog in your on-prem environment?'",
            "3. Prepare a competitive battlecard for top 3 competitors (Datadog, SolarWinds, ServiceNow) with scripted one-liner responses."
        ]))
        tips.append(_make_tip("Price / ROI discussion", [
            "1. Proactively address TCO before the prospect raises it — e.g. 'Our device-based pricing means you pay once per device — no per-module, per-host, or per-user surprises.'",
            "2. Build a simple ROI narrative: 'Number of engineers x hours/week on manual monitoring x average hourly cost = annual saving from Motadata automation.'",
            "3. Introduce commercial conversation after the first wow moment when the prospect asks about integration."
        ]))

    # 5. ENGAGEMENT
    if q_count >= 3:
        pros.append("Engagement: High prospect participation with multiple clarifying questions.")
    else:
        cons.append(_make_con("Engagement", "Questions asked by prospect",
            "Low client interaction throughout. Few substantive questions were asked by the prospect.",
            "Create deliberate pause points — 'Before I move on, does this workflow match how your team handles incidents today? What questions do you have?'"))
        tips.append(_make_tip("Questions asked by prospect", [
            "1. Create deliberate pause points — e.g. 'Before I move on, does this workflow match how your team handles incidents today? What questions do you have?'",
            "2. After every topic block, use a 2-question pause: 'What's one thing still unclear?' Wait 5 seconds — the discomfort of silence prompts more responses.",
            "3. Use directed questions with names: 'Siraj, does this match what you've seen in your South India accounts?'"
        ]))
        cons.append(_make_con("Engagement", "Use case confirmation",
            "Use cases mentioned but never explicitly confirmed by the prospect with a specific statement.",
            "Ask explicitly after every module: 'Does this solve the alert fatigue problem you described earlier, or is there a gap I should address?'"))
        tips.append(_make_tip("Use case confirmation", [
            "1. Ask explicit confirmation after every module — e.g. 'Does this solve the alert fatigue problem you described earlier?'",
            "2. Listen for forward-looking language ('when we implement this...') as a signal of confirmed alignment.",
            "3. After each use case shown, map it back: 'You mentioned X earlier — this is exactly how Motadata handles that scenario.'"
        ]))

    # 6. CLOSE
    if signals.get("has_next_steps"):
        pros.append("Close: Momentum established with clear next steps or follow-up actions.")
    else:
        cons.append(_make_con("Close", "Clear next step set",
            "No concrete next step confirmed with a named owner and specific date. Deal momentum is at risk.",
            "End every call with: 'Let's schedule the POC kickoff for Thursday the 15th — I'll send the agenda and you confirm the technical team. Agreed?'"))
        tips.append(_make_tip("Clear next step set", [
            "1. End every call with a named owner and specific date — e.g. 'Let's schedule the POC kickoff for Thursday the 15th. I'll send the agenda — you confirm the technical team?'",
            "2. Make each next step SMART — instead of 'we'll follow up,' say 'I'll send the proposal by Friday and you'll loop in your IT director by Monday.'",
            "3. Send a written summary within 30 minutes after every session: topics covered, 3 decisions made, named actions with deadlines."
        ]))
        cons.append(_make_con("Close", "Mutual action plan",
            "All actions assigned top-down — no co-created commitments secured from the prospect.",
            "End with a close ritual: 'My action is to send the proposal by Friday, and your action is to loop in your IT director — agreed?' Wait for verbal confirmation."))
        tips.append(_make_tip("Mutual action plan", [
            "1. Introduce a session close ritual — final 5 minutes: go around and ask each person to state their one commitment.",
            "2. Use verbal confirmation: 'Siraj, you'll document the fix in the KB by Friday. Agreed?' Wait for the yes.",
            "3. Track commitments in monday.com with person's name, action, and due date. Review in the following week's scrum."
        ]))

    # 7. RISKS
    if signals.get("has_competitor") and not signals.get("has_pricing"):
        cons.append(_make_con("Risks", "Resolution quality",
            "Competitor mentions present without pricing alignment — prospect may be cost-comparing without the data to decide.",
            "Address TCO proactively: 'Our device-based pricing means you pay once per device — no per-module, per-host, or per-user surprises. Let me show you a comparison.'"))
        tips.append(_make_tip("Resolution quality", [
            "1. Use the AREB method — Acknowledge, Reframe, Evidence, Bridge — e.g. 'I hear the concern about cost. Our customers consolidate 3 tools into one, reducing total spend. Can I show you a TCO comparison?'",
            "2. Prepare a Motadata vs. competitor pricing comparison slide for the top 3 competitors.",
            "3. Address TCO proactively before the pricing objection is raised: 'Before I move to features, let me show you how this compares on total cost.'"
        ]))

    while len(pros) < 3:
        pros.append("Performance: Maintained professional standards throughout the session.")
    while len(cons) < 2:
        cons.append(_make_con("Performance", "General",
            "Some dimensions lacked depth and could benefit from more structured evidence.",
            "Review the transcript to identify specific missed cues and address them in the next session."))

    return pros[:8], cons[:14], tips[:15]


def _build_improvement_item(i) -> dict:
    """Return a structured tip object { kpi, actions, evidence }."""
    if isinstance(i, str):
        return {"kpi": "", "actions": [i], "evidence": ""}
    kpi = str(i.get("kpi", "") or "").strip()
    actions = i.get("actions", [])
    if not isinstance(actions, list):
        actions = []
    # Fallback: old single improvement/example_sentence format
    if not actions:
        improvement = str(i.get("improvement", "") or "").strip()
        example = str(i.get("example_sentence", "") or "").strip()
        if improvement:
            text = f"{improvement} — e.g. \"{example}\"" if example else improvement
            actions = [f"1. {text}"]
    evidence = str(i.get("evidence", "") or "").strip()
    return {"kpi": kpi, "actions": actions, "evidence": evidence}


def _make_con(dimension, kpi, explanation, suggestion, quote="") -> dict:
    return {"dimension": dimension, "kpi": kpi, "explanation": explanation, "quote": quote, "suggestion": suggestion}


def _make_tip(kpi, actions, evidence="") -> dict:
    return {"kpi": kpi, "actions": actions, "evidence": evidence}


# ─── OpenAI GPT analysis (used when OPENAI_API_KEY is set) ──────────────────

def _analyze_with_openai(transcript_text: str) -> dict:
    from openai import OpenAI

    client = OpenAI()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Chunked approach: extract evidence per chunk, then consolidate.
    chunk_chars = int(os.getenv("OPENAI_CHUNK_CHARS", "12000"))
    overlap = int(os.getenv("OPENAI_CHUNK_OVERLAP", "600"))
    _chunk_text(transcript_text, chunk_chars=chunk_chars, overlap=overlap)  # pre-warm cache

    extract_prompt = (
        "You analyze a Microsoft Teams demo/discovery transcript.\n"
        "Your task is to identify evidence for 23 specific KPIs across 7 dimensions.\n\n"
        "Dimensions & KPIs:\n"
        "1. Discovery: Pain identification, Current infra and state mapping, Stakeholder mapping, Competition identification\n"
        "2. Rapport: Agenda setting, Personalisation, Active listening signals, Talk-to-listen ratio\n"
        "3. Demo: Relevance of demo flow, Story-based narrative, Value articulation, Handling technical Qs\n"
        "4. Objections: Objection recognition, Resolution quality, Competitor handling, Price / ROI discussion\n"
        "5. Engagement: Questions asked by prospect, Use case confirmation, Sentiment tone, Internal mention\n"
        "6. Close: Clear next step set, Timeline established, Mutual action plan\n"
        "7. Risks: Feature gaps raised, Budget concern signals, Disengagement moments, Unresolved objections\n\n"
        "INSTRUCTIONS:\n"
        "- kpiEvidence: Score each of the 23 KPIs (1-5) and provide a specific reasoning and evidence quote from the transcript.\n"
        "- riskFlags: Identify if any of the 4 risk indicators are present.\n"
        "- observations.whatWentWell: 3-5 strengths. Format each as: 'Dimension: Title — \\'exact short quote from transcript\\''\n"
        "- observations.whatWentWrong: 3-5 weaknesses. Each must be a JSON object: { dimension, kpi, explanation, quote (exact transcript quote), suggestion (specific actionable fix with example sentence) }\n"
        "- improvements: For EVERY KPI that scored 1, 2, or 3, provide one improvement object with: kpi (exact name), actions (array of 2-3 numbered specific actions with example sentences), evidence (exact transcript quote showing the gap).\n"
        "- kpiGaps: For EVERY KPI that scored 1, 2, or 3, provide a 'whatWasMissing' bullet list (3-4 items) describing what was specifically absent from this call for that KPI.\n"
        "- summary: A 'Complete Analysis' synthesizing performance across 7 dimensions and deal momentum.\n\n"
        "Return ONLY valid JSON with this exact structure:\n"
        "{\n"
        "  \"metadata\": { \"clientName\": \"string\", \"productName\": \"string\" },\n"
        "  \"summary\": \"...\",\n"
        "  \"observations\": {\n"
        "    \"whatWentWell\": [\"Dimension: Title — 'transcript quote'\"],\n"
        "    \"whatWentWrong\": [{ \"dimension\": \"string\", \"kpi\": \"string\", \"explanation\": \"string\", \"quote\": \"string\", \"suggestion\": \"string\" }]\n"
        "  },\n"
        "  \"improvements\": [{ \"kpi\": \"exact KPI name\", \"actions\": [\"1. action — e.g. 'sentence'\", \"2. action — e.g. 'sentence'\", \"3. action — e.g. 'sentence'\"], \"evidence\": \"exact transcript quote\" }],\n"
        "  \"kpiGaps\": { \"KPI Name\": { \"whatWasMissing\": [\"bullet 1\", \"bullet 2\", \"bullet 3\"] } },\n"
        "  \"kpiEvidence\": {\n"
        "     \"KPI Name (Exact)\": { \"score_1_to_5\": 5, \"reasoning\": \"...\", \"evidence_quote\": \"...\" }\n"
        "  },\n"
        "  \"riskFlags\": {\n"
        "     \"Risk Name (Exact)\": { \"present_boolean\": true, \"evidence_quote\": \"...\" }\n"
        "  }\n"
        "}\n\n"
        "CRITICAL: Keys in kpiEvidence, riskFlags, kpiGaps, and improvements MUST use exact KPI/risk label names.\n"
    )

    resp = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are an expert Presales Coach. Analyze the transcript and provide a structured evaluation based on the Authoritative Scoring Framework. Be objective and critical."},
            {"role": "user", "content": f"{extract_prompt}\n\nTRANSCRIPT:\n{transcript_text[:100000]}"},
        ],
    )

    content = (resp.choices[0].message.content or "{}").strip()
    if content.startswith("```") and content.endswith("```"):
        content = content.strip("` \n")
        if content.lower().startswith("json"):
            content = content[4:].strip()
    try:
        data = json.loads(content)
    except Exception as e:
        print(f"[analysis] OpenAI failed: {e}")
        return _analyze_with_local(transcript_text)

    # Map back to application structure
    return {
        "clientName": data.get("metadata", {}).get("clientName", ""),
        "productName": data.get("metadata", {}).get("productName", ""),
        "summary": data.get("summary", ""),
        "pros": data.get("observations", {}).get("whatWentWell", []),
        "cons": data.get("observations", {}).get("whatWentWrong", []),
        "tips": [_build_improvement_item(i) for i in data.get("improvements", [])],
        "sentiment": "neutral",
        "questionsCount": 0,
        "questionsDetected": [],
        "qaPairs": [],
        "demoQualityEvaluation": data.get("summary", ""),
        "structuredDetails": data.get("kpiEvidence", {}),
        "riskFlags": data.get("riskFlags", {}),
        "kpiGaps": data.get("kpiGaps", {})
    }


# ─── Claude analysis (used when ANTHROPIC_API_KEY is set) ───────────────────

def _analyze_with_claude(transcript_text: str) -> dict:
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
    client = anthropic.Anthropic(api_key=api_key)

    system_prompt = (
        "You are an expert Presales Coach at Motadata, a unified IT operations platform company. "
        "You evaluate demo and discovery meeting transcripts against Motadata's specific sales methodology and product knowledge.\n\n"

        "=== MOTADATA PRODUCT PORTFOLIO ===\n"
        "Motadata sells two flagship platforms:\n\n"

        "1. ObserveOps (Unified Observability): Full-stack AI-driven monitoring.\n"
        "   Modules: Hybrid Infrastructure Monitoring (HIM), APM, Real User Monitoring (RUM), "
        "Log Monitoring, Network Observability, Network Configuration & Compliance Management (NCCM), SLO Management.\n"
        "   Key capabilities: AI/ML dynamic baseline alerting (no static thresholds), cross-layer correlation "
        "(RUM → APM → infra → network in one click), runbook automation + Ansible integration, "
        "pipeline-first architecture (1 TB/day logs), SLO with error budgets, CIS benchmark compliance, "
        "multi-master HA/DR, scales to 50,000 devices, on-prem + cloud, proprietary DB (no open-source dependency).\n\n"

        "2. ServiceOps (Unified ITSM): ITIL v4-aligned service management.\n"
        "   Modules: Service Desk, IT Asset Management (ITAM), Patch & Deployment Management, "
        "Endpoint Management, Vulnerability Management, CMDB.\n"
        "   Key capabilities: AI-powered ticket categorization/routing/deduplication, "
        "omnichannel (11+ channels), no-code visual orchestrator, vulnerability-to-patch pipeline, "
        "MSP multi-tenant edition, on-prem + SaaS, ISO 27001:2022 + SOC 2 Type 2 certified, "
        "device-based pricing (no per-module surcharges).\n\n"

        "=== TARGET BUYER PERSONAS ===\n"
        "- CIO/CTO: Cares about tool consolidation, TCO reduction, compliance/audit exposure, board-ready reporting, data sovereignty.\n"
        "- VP IT Operations: Cares about MTTR reduction, uptime SLAs, alert-to-resolution time, tool consolidation.\n"
        "- IT Operations Manager: Cares about tool sprawl, alert fatigue, slow RCA in hybrid environments, manual remediation, capacity surprises.\n"
        "- Service Desk Manager: Cares about ticket triage time, SLA breaches, self-service adoption, recurring incidents, fragmented reporting.\n"
        "- NOC Lead: Cares about network visibility, alert storms, configuration drift, swivel-chair investigations, bandwidth analysis.\n"
        "- CISO: Cares about vulnerability exposure, patch compliance, endpoint security, data sovereignty.\n\n"

        "=== KEY PAIN POINTS MOTADATA SOLVES ===\n"
        "1. Tool sprawl (4-7 disconnected tools) adding 30-60 min to MTTR and creating data silos.\n"
        "2. Alert fatigue from static thresholds generating thousands of false-positive alerts daily.\n"
        "3. Slow RCA in hybrid environments — app/infra/network finger-pointing across war rooms.\n"
        "4. Manual ticket triage/routing causing SLA breaches, technician burnout.\n"
        "5. Unmanaged assets and license non-compliance creating audit exposure.\n"
        "6. Vulnerability-to-patch gap leaving endpoints exposed.\n"
        "7. Integration maintenance overhead (REST APIs between disparate tools).\n"
        "8. No single source of truth for reporting to leadership.\n\n"

        "=== COMPETITORS & HOW TO DIFFERENTIATE ===\n"
        "- ServiceNow: Expensive, cloud-first, separate module licenses, complex implementation. "
        "Motadata advantage: device-based pricing, on-prem option, unified platform, faster deployment.\n"
        "- Datadog/Dynatrace: SaaS-only, per-host/per-GB pricing spikes, no ITSM. "
        "Motadata advantage: on-prem, predictable pricing, full ITSM + observability in one.\n"
        "- SolarWinds: Fragmented modules (NPM/SAM/VMAN/NCM sold separately), perpetual license complexity. "
        "Motadata advantage: natively unified, no inter-module integration maintenance.\n"
        "- Freshservice/Jira SM: Cloud-only, lack patch management, vulnerability management, on-prem CMDB depth. "
        "Motadata advantage: unified endpoint security pipeline, on-prem deployment.\n"
        "- ManageEngine: Separate products (not unified), each requires separate license + admin. "
        "Motadata advantage: single platform, single pane of glass.\n"
        "- Zabbix: Open-source, requires heavy engineering customization, no native AI/ML, no support SLA. "
        "Motadata advantage: enterprise-ready, AI/ML built-in, certified compliance, professional support.\n"
        "- PRTG: SMB-focused, sensor-based pricing, limited K8s/container/cloud support. "
        "Motadata advantage: enterprise scale, full hybrid coverage, no sensor limits.\n\n"

        "=== IDEAL DISCOVERY QUESTIONS (what good consultants ask) ===\n"
        "Pain discovery: 'What challenges are you currently experiencing with your monitoring/service desk tools?', "
        "'How long does it typically take your team to resolve a P1 incident?', "
        "'How many different tools does your team use to manage IT operations today?', "
        "'What's your current mean time to resolution, and what's your target?'\n"
        "Infrastructure mapping: 'What monitoring tools are you currently using?', "
        "'Tell me about your current setup — on-prem, cloud, hybrid?', "
        "'How are you currently managing your asset inventory and software licenses?'\n"
        "Stakeholder mapping: 'Who else is involved in evaluating this decision?', "
        "'Who would be the key stakeholders and executive sponsor for this project?', "
        "'What does your procurement/approval process look like?'\n"
        "Competition: 'Are you evaluating any other vendors?', "
        "'What does your current vendor relationship look like?', "
        "'Have you looked at ServiceNow / SolarWinds / Datadog?'\n"
        "Budget/authority: 'Do you have a budget allocated for this initiative?', "
        "'What's your target timeline to have a solution in place?'\n\n"

        "=== OBJECTION HANDLING FRAMEWORK (AREB) ===\n"
        "Good consultants use the AREB framework: Acknowledge → Reframe → Evidence → Bridge.\n"
        "Common objections they should handle:\n"
        "- 'We already have ServiceNow' → Acknowledge investment, reframe on gaps (no unified monitoring), evidence (30-60 min MTTR penalty), bridge to co-existence or replacement.\n"
        "- 'Datadog/SolarWinds works fine for us' → Acknowledge current use, reframe on hidden costs (per-module/per-host pricing), evidence (TCO comparison), bridge to consolidation story.\n"
        "- 'Too expensive' → Reframe on total cost of ownership vs. tool sprawl, expose hidden integration costs.\n"
        "- 'We need cloud-only' → Clarify Motadata has SaaS option, address data sovereignty benefits of on-prem.\n"
        "- 'Not the right time' → Uncover business event driving urgency (audit, outage, renewal date).\n\n"

        "=== IDEAL DEMO FLOW ===\n"
        "A great Motadata demo follows this structure:\n"
        "1. Agenda set and confirmed with prospect.\n"
        "2. Discovery done first — pain identified before showing any product.\n"
        "3. Demo tailored to stated pain (not a feature tour).\n"
        "4. Story arc: 'You told us X pain → here's how Motadata solves it → here's the outcome you'd see.'\n"
        "5. Cross-platform value shown if relevant (ObserveOps + ServiceOps integration).\n"
        "6. ROI/value quantified (MTTR reduction, tool consolidation savings, SLA improvement).\n"
        "7. Clear next step agreed (POC scope, proposal, technical deep-dive, references).\n\n"

        "=== SCORING CALIBRATION ===\n"
        "Score 5: Exemplary — consultant followed Motadata best practice for this KPI with clear evidence from transcript.\n"
        "Score 4: Good — mostly followed best practice with minor gaps.\n"
        "Score 3: Partial — attempted but missed key elements Motadata methodology requires.\n"
        "Score 2: Weak — attempted but largely ineffective or missed the point.\n"
        "Score 1: Missing — not attempted at all.\n\n"

        "Be objective and critical. A mediocre demo should score 40-55/100. An excellent demo 75-90/100. "
        "Do not inflate scores. Always cite exact quotes from the transcript as evidence."
    )

    user_prompt = (
        "Analyze this Motadata demo/discovery meeting transcript across 23 KPIs in 7 dimensions "
        "using the Motadata-specific scoring framework defined in your instructions.\n\n"

        "DIMENSIONS & KPIs TO SCORE (each 1-5):\n"
        "1. Discovery: Pain identification, Current infra and state mapping, Stakeholder mapping, Competition identification\n"
        "2. Rapport: Agenda setting, Personalisation, Active listening signals, Talk-to-listen ratio\n"
        "3. Demo: Relevance of demo flow, Story-based narrative, Value articulation, Handling technical Qs\n"
        "4. Objections: Objection recognition, Resolution quality, Competitor handling, Price / ROI discussion\n"
        "5. Engagement: Questions asked by prospect, Use case confirmation, Sentiment tone, Internal mention\n"
        "6. Close: Clear next step set, Timeline established, Mutual action plan\n"
        "7. Risks (boolean flags): Feature gaps raised, Budget concern signals, Disengagement moments, Unresolved objections\n\n"

        "KPI-SPECIFIC SCORING RUBRICS (score 5 criteria for each):\n"
        "- Pain identification (score 5): Asked 3+ targeted pain questions covering tool sprawl, MTTR, alert fatigue, SLA breaches, or compliance gaps. Pain was confirmed by prospect before demo began.\n"
        "- Current infra and state mapping (score 5): Explicitly asked about current tools (monitoring, ITSM, asset), deployment model (on-prem/cloud/hybrid), team size, and existing integrations.\n"
        "- Stakeholder mapping (score 5): Identified decision makers, budget owner, technical evaluators, and executive sponsor. Asked about procurement process and approval chain.\n"
        "- Competition identification (score 5): Asked directly about incumbent vendors and other tools being evaluated. Named specific competitors (ServiceNow, SolarWinds, Datadog, etc.).\n"
        "- Agenda setting (score 5): Opened with a clear agenda shared with the prospect. Confirmed time available and prospect priorities before proceeding.\n"
        "- Personalisation (score 5): Demo and messaging tailored to prospect's specific industry, role/persona, pain points, and named their company or use case specifically.\n"
        "- Active listening signals (score 5): Paraphrased prospect statements, asked follow-up questions based on what prospect said, adjusted demo direction in response to feedback.\n"
        "- Talk-to-listen ratio (score 5): Balanced conversation — prospect spoke at least 30% of the time; consultant did not monologue for extended periods.\n"
        "- Relevance of demo flow (score 5): Demo modules shown directly matched the pain points discovered (e.g., showed HIM if infra monitoring pain was raised, Service Desk if SLA issues mentioned). No generic feature tour.\n"
        "- Story-based narrative (score 5): Used a clear story arc — 'You told us X → here's the problem in your world → here's how Motadata solves it → here's the outcome.' Not a feature walkthrough.\n"
        "- Value articulation (score 5): Quantified business value (e.g., MTTR reduction, tool consolidation savings, SLA improvement percentage, FTE time saved). Connected features to business outcomes.\n"
        "- Handling technical Qs (score 5): Answered all technical questions confidently and accurately. For unknown items, committed to follow-up with specifics. Did not bluff.\n"
        "- Objection recognition (score 5): Identified every concern or hesitation raised by the prospect, explicitly acknowledged it, and addressed it using the AREB framework.\n"
        "- Resolution quality (score 5): Objections were fully resolved using Motadata-specific reframes and evidence (pricing transparency, on-prem option, unified platform, certifications). Prospect concern was neutralized.\n"
        "- Competitor handling (score 5): Named the specific competitor, acknowledged it respectfully, then used Motadata's differentiation (unified platform, device pricing, on-prem, AI/ML) to position clearly. No FUD.\n"
        "- Price / ROI discussion (score 5): Proactively addressed TCO — exposed hidden costs of competing tools (per-module, per-host, integration overhead). Quantified ROI with specific metrics.\n"
        "- Questions asked by prospect (score 5): Prospect asked 5+ substantive questions showing genuine interest and engagement (not just clarifications).\n"
        "- Use case confirmation (score 5): Prospect explicitly confirmed their use case aligns with what was shown. Statements like 'yes that's exactly our problem' or 'this would solve our X issue.'\n"
        "- Sentiment tone (score 5): Consistently positive tone from prospect throughout. Enthusiasm, engagement, leaning in, forward-looking language ('when we implement this...').\n"
        "- Internal mention (score 5): Prospect mentioned internal stakeholders by name or role ('our CTO would love this', 'I need to show this to our team'), indicating internal advocacy building.\n"
        "- Clear next step set (score 5): Specific next action agreed with a named owner and a date — POC kickoff, proposal sent by X date, technical deep-dive scheduled, reference call arranged.\n"
        "- Timeline established (score 5): Prospect committed to a decision timeline or go-live date. A business event driving urgency was identified (contract renewal, audit, outage history).\n"
        "- Mutual action plan (score 5): Both sides agreed on what each party needs to do before the next meeting. Written or verbally confirmed mutual commitments.\n\n"

        "INSTRUCTIONS:\n"
        "- kpiEvidence: Score each of the 23 KPIs (1-5) with Motadata-specific reasoning and an exact quote from the transcript.\n"
        "- riskFlags: Set present_boolean true/false for each of the 4 risk indicators. Consider Motadata-specific risks (feature gaps vs. ServiceNow/Datadog, budget concerns given enterprise pricing, disengagement if prospect showed SaaS-only preference).\n"
        "- observations.whatWentWell: 3-5 strengths. Format each as: 'Dimension: Title — \\'exact short quote from transcript\\''\n"
        "- observations.whatWentWrong: 3-5 weaknesses as objects: { dimension, kpi, explanation, quote (exact transcript quote showing the gap), suggestion (Motadata-specific fix with verbatim example sentence) }\n"
        "- improvements: For EVERY KPI that scored 1, 2, or 3, provide one object: kpi (exact label), actions (array of 2-3 numbered Motadata-specific actions with example sentences), evidence (exact transcript quote showing the gap).\n"
        "- kpiGaps: For EVERY KPI that scored 1, 2, or 3, list 3-4 specific bullets describing what was absent from THIS call for that KPI. Reference Motadata methodology.\n"
        "- summary: A complete analysis synthesizing performance across all 7 dimensions, deal momentum, and likelihood of progressing to POC or proposal.\n"
        "- metadata: Extract clientName and productName (ObserveOps / ServiceOps / Both) from the transcript.\n\n"

        "Return ONLY valid JSON with this exact structure (no markdown, no code blocks):\n"
        "{\n"
        "  \"metadata\": { \"clientName\": \"string\", \"productName\": \"string\" },\n"
        "  \"summary\": \"string\",\n"
        "  \"observations\": {\n"
        "    \"whatWentWell\": [\"Dimension: Title — 'transcript quote'\"],\n"
        "    \"whatWentWrong\": [{ \"dimension\": \"string\", \"kpi\": \"string\", \"explanation\": \"string\", \"quote\": \"string\", \"suggestion\": \"string\" }]\n"
        "  },\n"
        "  \"improvements\": [{ \"kpi\": \"string\", \"actions\": [\"1. action — e.g. 'sentence'\", \"2. action\", \"3. action\"], \"evidence\": \"exact transcript quote\" }],\n"
        "  \"kpiGaps\": { \"KPI Name\": { \"whatWasMissing\": [\"bullet 1\", \"bullet 2\", \"bullet 3\"] } },\n"
        "  \"kpiEvidence\": {\n"
        "    \"Pain identification\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Current infra and state mapping\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Stakeholder mapping\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Competition identification\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Agenda setting\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Personalisation\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Active listening signals\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Talk-to-listen ratio\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Relevance of demo flow\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Story-based narrative\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Value articulation\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Handling technical Qs\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Objection recognition\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Resolution quality\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Competitor handling\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Price / ROI discussion\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Questions asked by prospect\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Use case confirmation\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Sentiment tone\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Internal mention\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Clear next step set\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Timeline established\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" },\n"
        "    \"Mutual action plan\": { \"score_1_to_5\": 1, \"reasoning\": \"string\", \"evidence_quote\": \"string\" }\n"
        "  },\n"
        "  \"riskFlags\": {\n"
        "    \"Feature gaps raised\": { \"present_boolean\": false, \"evidence_quote\": \"string\" },\n"
        "    \"Budget concern signals\": { \"present_boolean\": false, \"evidence_quote\": \"string\" },\n"
        "    \"Disengagement moments\": { \"present_boolean\": false, \"evidence_quote\": \"string\" },\n"
        "    \"Unresolved objections\": { \"present_boolean\": false, \"evidence_quote\": \"string\" }\n"
        "  }\n"
        "}\n\n"
        "CRITICAL: KPI keys in kpiEvidence and riskFlags MUST match the labels above EXACTLY.\n\n"
        f"TRANSCRIPT:\n{transcript_text[:150000]}"
    )

    try:
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        content = (resp.content[0].text or "{}").strip()
        # Strip markdown code fences if Claude wraps response
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content).strip()
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"[analysis] Claude JSON parse failed ({e}), falling back to local")
        return _analyze_with_local(transcript_text)
    except Exception as e:
        print(f"[analysis] Claude API failed ({e}), falling back to local")
        raise

    tips = [_build_improvement_item(i) for i in data.get("improvements", [])]

    return {
        "clientName": data.get("metadata", {}).get("clientName", ""),
        "productName": data.get("metadata", {}).get("productName", ""),
        "summary": data.get("summary", ""),
        "pros": data.get("observations", {}).get("whatWentWell", []),
        "cons": data.get("observations", {}).get("whatWentWrong", []),
        "tips": tips,
        "sentiment": "neutral",
        "questionsCount": 0,
        "questionsDetected": [],
        "qaPairs": [],
        "demoQualityEvaluation": data.get("summary", ""),
        "structuredDetails": data.get("kpiEvidence", {}),
        "riskFlags": data.get("riskFlags", {}),
        "kpiGaps": data.get("kpiGaps", {})
    }


# ─── Heuristic KPI scoring (local, no OpenAI) ───────────────────────────────

def _find_quote(text: str, patterns: list, max_len: int = 120) -> str:
    """Return first sentence/line from text that matches any pattern."""
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) < 10:
            continue
        for p in patterns:
            if re.search(p, line, re.I):
                return f'"{line[:max_len].strip()}"'
    return "N/A"


def _score(count: int, thresholds=(3, 2, 1)) -> int:
    """Map a keyword hit count to 1-5 score using thresholds (5,4,3 cutoffs)."""
    if count >= thresholds[0]: return 5
    if count >= thresholds[1]: return 4
    if count >= thresholds[2]: return 3
    return 1


def _kpi(score: int, reason: str, evidence: str) -> dict:
    return {"score_1_to_5": max(1, min(5, score)), "reasoning": reason, "evidence_quote": evidence}


def _cnt_in(text: str, patterns: list) -> int:
    """Count keyword hits in a specific text block."""
    return sum(len(re.findall(p, text or "", flags=re.I)) for p in patterns)


def _has_in(text: str, pattern: str) -> bool:
    return bool(re.search(pattern, text or "", re.I))


def _quote_from(text: str, patterns: list, max_len: int = 120) -> str:
    """Return first matching line from a specific text block."""
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or len(line) < 10:
            continue
        for p in patterns:
            if re.search(p, line, re.I):
                return f'"{line[:max_len].strip()}"'
    return "N/A"


def _score_kpis_heuristic(text: str, signals: dict) -> dict:
    """
    Score all 23 KPIs (1-5) using speaker-aware, calibrated heuristics.
    Presenter text is scored for consultant behaviors (discovery questions, agenda, etc.).
    Client text is scored for engagement signals (questions asked, use case, internal mention).
    Negative signals cap scores to avoid inflated results.
    """
    t = text or ""
    p_text = signals.get("presenter_text") or t   # consultant/presenter speech
    c_text = signals.get("client_text") or ""     # client/prospect speech

    # ── DISCOVERY: scored from FULL text (any consultant team member may ask) ──

    # Pain identification: did any consulting-side speaker ask targeted pain questions?
    # Check both presenter AND full text — multiple consultants may be on the call
    pain_q_c = _cnt_in(t, [
        r"\bwhat\s+(challenges?|problems?|issues?|pain\s+points?|difficulties)\b",
        r"\bhow\s+(are\s+you|do\s+you)\s+(currently|managing|handling|dealing)\b",
        r"\btell\s+me\s+(about|more\s+about)\s+(your\s+)?(challenges?|problems?|situation)\b",
        r"\bwhat.s\s+(not\s+working|the\s+(main\s+)?challenge|causing\s+issues?)\b",
        r"\bwhat\s+is\s+(your\s+)?(current\s+)?(pain|challenge|problem|issue)\b",
    ])
    # Negative: client had to redirect ("start the demo") before discovery was done
    early_redirect = _has_in(c_text, r"\b(start\s+(showing|the\s+demo|the\s+product)|please\s+(begin|show|start))\b")
    # Also check if client explicitly raised a pain (partial credit if unprompted)
    client_pain_c = _cnt_in(c_text, [r"\b(problem|challenge|issue|difficulty|concern|struggle|pain|not\s+working)\b"])
    pain_score = 1
    if pain_q_c >= 3: pain_score = 4
    elif pain_q_c >= 2: pain_score = 3
    elif pain_q_c >= 1: pain_score = 2
    elif client_pain_c >= 2: pain_score = 2
    if early_redirect and pain_score > 2: pain_score = 2   # cut short by client → cap at 2
    pain_ev = _quote_from(t, [r"\b(challenge|problem|issue|pain)\b"])
    pain_reason = (
        f"Consulting team asked {pain_q_c} pain-discovery question(s)"
        + (" but was redirected to product demo before discovery was complete." if early_redirect else ".")
        if pain_q_c >= 1 else
        f"No structured pain-discovery questions; client raised {client_pain_c} concern(s) independently."
        + (" Client redirected to demo before discovery began." if early_redirect else "")
    )

    # Current infra/state mapping: questions about existing tools/setup (any consultant)
    infra_q_c = _cnt_in(t, [
        r"\bwhat\s+(tool|system|platform|solution|software)\s+(are\s+you|do\s+you)\s+(using|currently|running)\b",
        r"\btell\s+me\s+about\s+your\s+(current|existing)\s+(setup|infrastructure|environment|stack|process)\b",
        r"\bhow\s+(are\s+you\s+currently|do\s+you\s+currently)\s+(managing|handling|monitoring|tracking)\b",
        r"\bwhat.s\s+your\s+(current|existing)\s+(tool|setup|process|workflow|infrastructure)\b",
    ])
    # Partial credit: client mentioned their current tool
    client_infra_c = _cnt_in(c_text, [r"\b(currently\s+using|we\s+use|we\s+have|our\s+current|using\s+\w+\s+for)\b"])
    infra_score = 1
    if infra_q_c >= 3: infra_score = 4
    elif infra_q_c >= 2: infra_score = 3
    elif infra_q_c >= 1: infra_score = 2
    elif client_infra_c >= 1: infra_score = 2   # client volunteered infra info
    if early_redirect and infra_score > 2: infra_score = 2
    infra_ev = _quote_from(c_text, [r"\b(currently\s+using|we\s+use|our\s+current)\b"]) or \
               _quote_from(t, [r"\b(current|existing|infrastructure|setup)\b"])
    infra_reason = (
        f"Consulting team asked {infra_q_c} infrastructure-mapping question(s); client also shared {client_infra_c} current-state detail(s)."
        if infra_q_c >= 1 else
        f"No direct infrastructure-mapping questions; client independently shared {client_infra_c} current-state mention(s)."
        if client_infra_c >= 1 else
        "No structured mapping of current infrastructure or tools detected."
    )

    # Stakeholder mapping: did presenter ask about decision makers?
    stkh_c = _cnt_in(p_text, [
        r"\bwho\s+(else\s+)?(is|will\s+be)\s+(involved|part\s+of|evaluating|reviewing|approving|deciding)\b",
        r"\bwho\s+(makes?|would\s+make)\s+the\s+(final\s+)?decision\b",
        r"\bwho\s+(is\s+the\s+)?champion\b",
        r"\bwho\s+(else\s+)?should\s+(we|i)\s+(include|loop\s+in|involve)\b",
        r"\b(decision.?maker|budget\s+owner|executive\s+sponsor|approver)\b",
    ])
    stakeholder_score = min(4, max(1, stkh_c + 1))
    stkh_ev = _quote_from(p_text, [r"\b(who\s+decides|decision.?maker|approver|stakeholder)\b"])
    stakeholder_reason = (
        f"Stakeholder structure explored with {stkh_c} targeted question(s)."
        if stkh_c >= 1 else
        "No stakeholder mapping questions asked; decision-maker structure is unknown."
    )

    # Competition identification: did presenter PROACTIVELY ask about competitive landscape?
    comp_ask_c = _cnt_in(t, [
        r"\b(are\s+you\s+evaluating|are\s+you\s+looking\s+at)\s+(any\s+)?(other|alternative)\b",
        r"\bwhat\s+(else|other\s+solutions?)\s+(are\s+you|have\s+you)\s+(looking|considered|evaluated)\b",
        r"\bwho\s+(else\s+are\s+you|are\s+you\s+also)\s+(talking\s+to|considering|evaluating)\b",
        r"\b(any\s+other\s+tools?|other\s+vendors?|other\s+solutions?)\s+(you.re|you\s+are)\s+(evaluating|looking\s+at)\b",
    ])
    # Competitor names raised BY CLIENT (reactive — consultant didn't ask first)
    comp_client_c = _cnt_in(c_text, [
        r"\b(intune|servicenow|jira|zendesk|splunk|datadog|dynatrace|pagerduty|glpi|solarwinds|freshservice|bmc|ivanti|cherwell|kayako|spiceworks|zabbix|nagios|prtg)\b",
    ])
    # Presenter acknowledged or followed up on competitor mentions
    comp_ack_c = _cnt_in(p_text, [
        r"\b(intune|glpi|servicenow|jira|zendesk|splunk|datadog)\b",
    ])
    comp_score = 1
    if comp_ask_c >= 2: comp_score = 4
    elif comp_ask_c >= 1: comp_score = 3
    elif comp_ask_c == 0 and comp_client_c >= 1 and comp_ack_c >= 1:
        comp_score = 2   # reactive only: client raised it, presenter at least engaged
    # If purely reactive (client raised it, presenter deferred/no differentiation) → stay at 1
    comp_ev = _quote_from(c_text, [r"\b(intune|glpi|servicenow|jira|zendesk|alternative)\b"]) or \
              _quote_from(t, [r"\b(competitor|alternative)\b"])
    comp_reason = (
        f"Consultant proactively asked {comp_ask_c} competition-identification question(s)."
        if comp_ask_c >= 1 else
        f"No proactive competition-discovery questions; {comp_client_c} competitor name(s) raised by client — purely reactive identification."
        if comp_client_c >= 1 else
        "No competitor identification; competitive landscape was not explored."
    )

    # ── RAPPORT: scored from PRESENTER text ──────────────────────────────────

    # Agenda setting: did presenter set a structured agenda at start?
    agenda_c = _cnt_in(p_text, [
        r"\b(agenda|today\s+we.ll|today\s+i.ll|let.s\s+(start|begin|kick\s*off)|goal\s+for\s+today|plan\s+for\s+today)\b",
        r"\b(first\s+i.ll|we.ll\s+start\s+with|we.ll\s+cover|i.ll\s+walk\s+you\s+through\s+the\s+agenda)\b",
        r"\b(structure\s+for\s+(today|this\s+call)|three\s+things|two\s+things|let\s+me\s+outline)\b",
    ])
    # Negative: if client had to redirect immediately (shows no agenda was set)
    client_redirected = _has_in(c_text, r"\b(can\s+you\s+start|let.s\s+start|please\s+(begin|show)|show\s+me)\b")
    agenda_score = 1
    if agenda_c >= 2: agenda_score = 4
    elif agenda_c >= 1: agenda_score = 3
    if client_redirected and agenda_c == 0:
        agenda_score = 1   # client had to drive it — no agenda set
    agenda_ev = _quote_from(p_text, [r"\b(agenda|today\s+we.ll|let.s\s+start|goal\s+for\s+today)\b"])
    agenda_reason = (
        f"Agenda or structure was set with {agenda_c} explicit reference(s)."
        if agenda_c >= 1 else
        "No structured agenda was set at the start; the call began without clear goals or structure."
    )

    # Personalisation: tailored references to prospect's specific context
    personal_c = _cnt_in(p_text, [
        r"\b(you\s+mentioned|as\s+you\s+said|based\s+on\s+what\s+you\s+shared)\b",
        r"\b(for\s+your\s+(team|company|organization|use\s+case|environment|workflow))\b",
        r"\b(in\s+your\s+(case|scenario|environment|context)|specifically\s+for\s+you)\b",
        r"\b(tailored|customized|personali[sz]ed)\s+(to|for)\s+your\b",
        r"\b(your\s+(organization|company|setup|environment|infrastructure))\b",
    ])
    # Partial credit: presenter mentioned client's specific tool or use case
    personal_tool_c = _cnt_in(p_text, [r"\b(glpi|intune|your\s+(current|existing)\s+\w+)\b"])
    personal_score = 1
    if personal_c >= 4: personal_score = 4
    elif personal_c >= 2: personal_score = 3
    elif personal_c >= 1 or personal_tool_c >= 1: personal_score = 2
    personal_ev = _quote_from(p_text, [r"\b(you\s+mentioned|for\s+your|in\s+your\s+case|your\s+environment)\b"])
    personal_reason = (
        f"Demo personalised to prospect context {personal_c} time(s)."
        + (f" Also referenced client's specific tools {personal_tool_c} time(s)." if personal_tool_c >= 1 else "")
        if personal_c >= 1 or personal_tool_c >= 1 else
        "Minimal personalisation; demo appeared generic rather than tailored to prospect's specific environment."
    )

    # Active listening: acknowledgment signals from presenter
    listen_c = _cnt_in(p_text, [
        r"\b(i\s+understand|so\s+you.re\s+saying|that.s\s+a\s+(good|great|valid|fair)\s+(point|question|concern))\b",
        r"\b(absolutely|got\s+it|makes\s+sense|noted|i\s+hear\s+you|i\s+see|right)\b",
        r"\b(good\s+question|great\s+question|fair\s+(point|question))\b",
        r"\b(let\s+me\s+(address|answer|respond\s+to)\s+that)\b",
    ])
    # Negative: if client asked to speak slowly (signal of NOT listening/adjusting)
    slow_down_c = _cnt_in(c_text, [r"\b(speak\s+(slowly|slower)|slow\s+down|too\s+fast|can\s+you\s+repeat|go\s+back)\b"])
    listen_score = 1
    if listen_c >= 6: listen_score = 4
    elif listen_c >= 3: listen_score = 3
    elif listen_c >= 1: listen_score = 2
    if slow_down_c >= 2: listen_score = min(listen_score, 2)   # pace not adjusted → cap at 2
    listen_ev = _quote_from(p_text, [r"\b(i\s+understand|makes\s+sense|good\s+question|got\s+it)\b"])
    listen_reason = (
        f"Active listening signals detected {listen_c} time(s) from presenter."
        + (f" However, client asked presenter to slow down {slow_down_c} time(s) — pace may not have been adjusted." if slow_down_c >= 1 else "")
    ) if listen_c >= 1 else (
        f"Limited active listening signals from presenter."
        + (f" Client asked to slow down {slow_down_c} time(s), suggesting pace/adaptation issues." if slow_down_c >= 1 else "")
    )

    # Talk-to-listen ratio: from word count analysis
    ratio = signals.get("client_talk_ratio")
    if ratio is None:
        ratio_score = 3
        ratio_reason = "Talk-to-listen ratio could not be calculated (no speaker labels detected)."
    elif ratio >= 0.40:
        ratio_score = 5
        ratio_reason = f"Excellent balance: client spoke ~{round(ratio*100)}% of the time."
    elif ratio >= 0.30:
        ratio_score = 4
        ratio_reason = f"Good balance: client spoke ~{round(ratio*100)}% of the time."
    elif ratio >= 0.20:
        ratio_score = 3
        ratio_reason = f"Moderately presenter-heavy: client spoke ~{round(ratio*100)}%; consultant dominated."
    elif ratio >= 0.10:
        ratio_score = 2
        ratio_reason = f"Presenter-dominated: client spoke only ~{round(ratio*100)}% — needs more client voice."
    else:
        ratio_score = 1
        ratio_reason = "Monologue-level: client barely spoke; conversation was entirely presenter-driven."
    # Additional negative: slow-down requests indicate presenter was going too fast
    if slow_down_c >= 2 and ratio_score > 2:
        ratio_score = 2
        ratio_reason += f" Pace issues confirmed: client asked to slow down {slow_down_c} time(s)."
    ratio_ev = "N/A"

    # ── DEMO: scored from PRESENTER text ─────────────────────────────────────

    # Relevance of demo flow: use-case / scenario-driven language
    flow_c = _cnt_in(p_text, [
        r"\b(use\s+case|scenario|let\s+me\s+show\s+you|walk\s+(you\s+)?through)\b",
        r"\b(demonstrate|in\s+your\s+(case|scenario)|based\s+on\s+(your|what\s+you))\b",
        r"\b(this\s+(is\s+how|helps\s+you|solves|addresses)\s+your)\b",
        r"\b(monitoring|discovery|alerting|infrastructure)\s+(module|feature|capability)\b",
    ])
    # Negative: heavy feature language (features over use cases)
    feature_heavy_c = _cnt_in(p_text, [
        r"\b(click\s+(on|here)|navigate\s+to|you\s+can\s+see\s+(here|this)|this\s+is\s+the\s+(screen|page|interface))\b",
    ])
    flow_score = 1
    if flow_c >= 6: flow_score = 5
    elif flow_c >= 4: flow_score = 4
    elif flow_c >= 2: flow_score = 3
    elif flow_c >= 1: flow_score = 2
    # Feature-heavy demo without scenario references — cap at 3
    if feature_heavy_c > flow_c * 2 and flow_score > 3:
        flow_score = 3
    elif feature_heavy_c > flow_c * 4 and flow_score > 2:
        flow_score = 2
    flow_ev = _quote_from(p_text, [r"\b(use\s+case|scenario|let\s+me\s+show|walk\s+through|monitoring\s+module)\b"])
    flow_reason = (
        f"Demo flow referenced use cases/capabilities {flow_c} time(s)."
        + (f" Notable feature-walkthrough language ({feature_heavy_c} instance(s)) also present." if feature_heavy_c > 2 else "")
        if flow_score >= 3 else
        f"Demo appeared feature-driven ({feature_heavy_c} feature reference(s)) rather than scenario-led; only {flow_c} use-case reference(s) detected."
    )

    # Story-based narrative: opening with a scenario/story (no "for example" — too generic)
    story_c = _cnt_in(p_text, [
        r"\bimagine\s+(you\s+have|you.re|a\s+scenario)\b",
        r"\bpicture\s+this\b",
        r"\bhere.s\s+(a\s+)?(scenario|story|situation)\b",
        r"\blet\s+me\s+tell\s+you\s+(a\s+story|about\s+a\s+scenario)\b",
        r"\bsay\s+you\s+(have|are|want|need)\b",
        r"\btypical\s+(scenario|case|situation)\s+(is|would\s+be)\b",
    ])
    story_score = 1
    if story_c >= 3: story_score = 4
    elif story_c >= 2: story_score = 3
    elif story_c >= 1: story_score = 2
    story_ev = _quote_from(p_text, [r"\b(imagine|picture\s+this|here.s\s+a\s+scenario|say\s+you)\b"])
    story_reason = (
        f"Story-based narrative elements detected {story_c} time(s) in the demo."
        if story_c >= 1 else
        "No story-based narrative structure; demo was a feature walkthrough without a unifying scenario or character."
    )

    # Value articulation: outcome/benefit language tied to business impact
    value_c = _cnt_in(p_text, [
        r"\b(this\s+(saves?|reduces?|eliminates?|automates?|improves?)\s+(you|your|time|cost|effort|manual))\b",
        r"\b(business\s+(value|impact|outcome|benefit)|cost\s+saving|time\s+saving|efficiency\s+gain)\b",
        r"\b(roi|return\s+on\s+investment|payback|measurable\s+impact)\b",
        r"\b(reduces?\s+(downtime|alert\s+noise|manual\s+effort|ticket\s+volume)|improves?\s+(sla|uptime|productivity))\b",
        r"\b(automatically|proactively)\s+(discovers?|monitors?|alerts?|manages?|correlates?)\b",
    ])
    value_score = 1
    if value_c >= 5: value_score = 5
    elif value_c >= 3: value_score = 4
    elif value_c >= 2: value_score = 3
    elif value_c >= 1: value_score = 2
    value_ev = _quote_from(p_text, [r"\b(saves?|reduces?|automatically|business\s+value|roi|efficiency|improves?)\b"])
    value_reason = (
        f"Business value articulated {value_c} time(s) with outcome language."
        if value_score >= 3 else
        f"Limited business value articulation ({value_c} instance(s)); demo focused on features rather than measurable outcomes."
    )

    # Handling technical Qs: did presenter answer technical/competitor questions in-call?
    tech_q_c = _cnt_in(c_text, [
        r"\b(how\s+does|does\s+it\s+(support|integrate|work\s+with|compare|handle))\b",
        r"\b(what\s+about|can\s+it|is\s+it\s+(compatible|integrated|secure|scalable))\b",
        r"\b(vs\.?\s+\w+|compared\s+to|difference\s+between|better\s+than)\b",
    ])
    # Deferred answers = promised but not resolved
    deferred_c = _cnt_in(p_text, [
        r"\b(i.ll\s+(send|share|check|get\s+back|follow\s+up)|will\s+share|let\s+me\s+get\s+back|we.ll\s+send)\b",
        r"\b(don.t\s+have\s+the\s+details|will\s+provide\s+the|share\s+a\s+(document|deck|comparison))\b",
        r"\b(battle\s+card|benchmark\s+doc|comparison\s+document)\b",
    ])
    # Direct in-call answers
    direct_ans_c = _cnt_in(p_text, [
        r"\b(yes\s+we\s+(support|integrate|handle)|here.s\s+how\s+we|let\s+me\s+show\s+you\s+how)\b",
        r"\b(our\s+(architecture|approach|method)\s+for)\b",
        r"\b(unlike\s+\w+|compared\s+to\s+\w+\s+we|advantage\s+over)\b",
    ])
    tech_score = 1
    if tech_q_c == 0:
        tech_score = 3   # no tech questions = no opportunity to show this
    elif direct_ans_c >= tech_q_c:
        tech_score = 4   # all questions answered in-call
    elif direct_ans_c >= 1:
        tech_score = 2   # some answered, some deferred
    elif deferred_c >= 1:
        tech_score = 1   # all deferred — not handled in-call
    tech_ev = _quote_from(p_text, [r"\b(i.ll\s+send|battle\s+card|will\s+share|don.t\s+have\s+the\s+details)\b"]) or \
              _quote_from(c_text, [r"\b(how\s+does|what\s+about|compared\s+to)\b"])
    tech_reason = (
        f"Client raised {tech_q_c} technical question(s); presenter answered {direct_ans_c} in-call and deferred {deferred_c}."
        if tech_q_c > 0 else
        "No specific technical questions were raised during the session."
    )

    # ── OBJECTIONS: mixed presenter + client text ─────────────────────────────

    # Objection recognition: how many concerns/questions were acknowledged
    obj_raised_c = _cnt_in(c_text, [
        r"\b(concern|worry|but\s+what\s+about|however|not\s+sure|hesitant|challenge\s+with|issue\s+with|problem\s+with)\b",
        r"\b(what\s+about|how\s+(about|does)|can\s+you|is\s+there)\b",
    ]) + tech_q_c  # competitor Qs are also objections
    obj_ack_c = _cnt_in(p_text, [
        r"\b(good\s+question|fair\s+(point|question)|that.s\s+a\s+valid|i\s+understand\s+your\s+concern)\b",
        r"\b(let\s+me\s+address|to\s+answer\s+that|regarding\s+(your|that))\b",
    ])
    obj_rec_score = 1
    if obj_raised_c >= 6 and obj_ack_c >= 2: obj_rec_score = 4
    elif obj_raised_c >= 4: obj_rec_score = 3
    elif obj_raised_c >= 2: obj_rec_score = 3
    elif obj_raised_c >= 1: obj_rec_score = 2
    obj_ev = _quote_from(c_text, [r"\b(concern|what\s+about|how\s+does|not\s+sure)\b"])
    obj_reason = (
        f"Client raised {obj_raised_c} concern(s)/question(s); presenter explicitly acknowledged {obj_ack_c}."
        if obj_raised_c >= 1 else
        "No objections or concerns explicitly surfaced in the conversation."
    )

    # Resolution quality: quality of responses (in-call resolution vs. deferrals)
    res_score = 1
    if deferred_c == 0 and direct_ans_c >= 2:
        res_score = 4
    elif deferred_c <= 1 and direct_ans_c >= 1:
        res_score = 3
    elif direct_ans_c >= 1:
        res_score = 2
    # High deferral rate caps resolution quality
    if deferred_c >= 2: res_score = min(res_score, 1)
    elif deferred_c >= 1: res_score = min(res_score, 2)
    res_ev = _quote_from(p_text, [r"\b(i.ll\s+(send|share|check)|will\s+provide|our\s+approach|let\s+me\s+clarify)\b"])
    res_reason = (
        f"Presenter answered {direct_ans_c} concern(s) in-call; {deferred_c} were deferred to follow-up documents."
        if direct_ans_c > 0 or deferred_c > 0 else
        "Resolution quality could not be assessed; insufficient objections or answers detected."
    )

    # Competitor handling: differentiation in-call (not just promising battle cards)
    diff_c = _cnt_in(p_text, [
        r"\b(unlike\s+\w+|compared\s+to\s+\w+|our\s+advantage\s+over|differentiator\b)\b",
        r"\b(we\s+(do|handle|support|offer)\s+this\s+(natively|out.of.the.box|differently))\b",
        r"\b(intune\s+(doesn.t|can.t|only)|servicenow\s+(is|costs|requires)|glpi\s+(lacks|doesn.t))\b",
    ])
    diff_score = 1
    if diff_c >= 3: diff_score = 4
    elif diff_c >= 2: diff_score = 3
    elif diff_c >= 1: diff_score = 2
    if deferred_c >= 2 and diff_c == 0: diff_score = 1   # all competitor Qs deferred → 1
    diff_ev = _quote_from(p_text, [r"\b(unlike|compared\s+to|our\s+advantage|differentiator)\b"])
    diff_reason = (
        f"In-call competitor differentiation provided {diff_c} time(s)."
        if diff_c >= 1 else
        f"No in-call differentiation against competitors; {'all comparison questions were deferred to follow-up documents' if deferred_c >= 1 else 'no competitor positioning established'}."
    )

    # Price/ROI discussion
    roi_c = _cnt_in(t, [
        r"\b(roi|return\s+on\s+investment|cost\s+(saving|reduction)|payback\s+period)\b",
        r"\b(pricing|price|license\s+cost|budget|commercial|how\s+much\s+(does|would)\s+it\s+cost)\b",
    ])
    roi_score = 1
    if roi_c >= 4: roi_score = 4
    elif roi_c >= 2: roi_score = 3
    elif roi_c >= 1: roi_score = 2
    roi_ev = _quote_from(t, [r"\b(roi|pricing|budget|cost\s+saving|license)\b"])
    roi_reason = (
        f"Pricing or ROI discussed {roi_c} time(s) during the call."
        if roi_c >= 1 else
        "No pricing or ROI discussion detected; commercial value case is unestablished."
    )

    # ── ENGAGEMENT: scored from CLIENT text ──────────────────────────────────

    # Questions asked by prospect: evaluative questions only (exclude pace/logistics requests)
    pace_pattern = re.compile(
        r"\b(speak\s+(slowly|slower)|slow\s+down|too\s+fast|can\s+you\s+(repeat|go\s+back|say\s+that\s+again)|can\s+you\s+please\s+(show|start|begin))\b",
        re.I
    )
    all_q_lines = [ln for ln in (c_text or "").split(". ") if "?" in ln or
                   re.search(r"\b(what|how|can\s+you|could\s+you|is\s+there|does\s+it|will\s+it|do\s+you)\b", ln, re.I)]
    # Filter out pace/logistics questions — keep only evaluative ones
    q_lines = [ln for ln in all_q_lines if not pace_pattern.search(ln)]
    q_count = len(q_lines)
    q_score = 1
    if q_count >= 7: q_score = 5
    elif q_count >= 4: q_score = 4
    elif q_count >= 2: q_score = 3
    elif q_count >= 1: q_score = 2
    q_ev = q_lines[0][:120] if q_lines else "N/A"
    q_reason = (
        f"Prospect asked {q_count} evaluative question(s) — active evaluation signals."
        if q_count >= 2 else
        f"Prospect asked only {q_count} evaluative question(s); limited engagement signals."
    )

    # Use case confirmation: client mapping solution to their own context
    uc_c = _cnt_in(c_text, [
        r"\b(this\s+(would|will|could)\s+(work\s+for|help)\s+(us|our))\b",
        r"\b(for\s+(us|our\s+(team|company|use\s+case)))\b",
        r"\b(in\s+our\s+(case|environment|scenario|setup))\b",
        r"\b(we\s+(could\s+use|would\s+need|are\s+looking\s+for))\b",
        r"\b(we\s+are\s+currently\s+using|we\s+use\s+\w+\s+for|our\s+(current|existing)\s+\w+)\b",
    ])
    uc_score = 1
    if uc_c >= 4: uc_score = 4
    elif uc_c >= 2: uc_score = 3
    elif uc_c >= 1: uc_score = 2
    uc_ev = _quote_from(c_text, [r"\b(for\s+us|in\s+our\s+case|this\s+would\s+work|we\s+are\s+currently|we\s+use)\b"])
    uc_reason = (
        f"Prospect connected solution to their use case {uc_c} time(s)."
        if uc_c >= 1 else
        "Limited use-case confirmation from prospect; no explicit mapping to their scenario detected."
    )

    # Sentiment tone: full conversation sentiment
    sent_obj = _sentiment_score_rule_based(t)
    sent_label = sent_obj.get("label", "neutral")
    # Negative: slow-down requests reduce sentiment score if otherwise positive
    if slow_down_c >= 3 and sent_label == "positive":
        sent_label = "neutral"
    sent_score = {"positive": 5, "neutral": 3, "negative": 1}.get(sent_label, 3)
    sent_reason = f"Overall sentiment was {sent_label}. {' '.join(sent_obj.get('rationale', []))}"
    if slow_down_c >= 2:
        sent_reason += f" Client requested slower pace {slow_down_c} time(s) — potential frustration signal."

    # Internal mention: client referencing their internal team or buying process
    internal_c = _cnt_in(c_text, [
        r"\b(our\s+(team|management|board|it\s+team|head|cto|cio|director))\b",
        r"\b(internally|we\s+need\s+to\s+(check|discuss|review|present|get\s+approval))\b",
        r"\b(i.ll\s+(check|discuss|share)\s+(with|internally))\b",
        r"\b(we\s+are\s+(using|evaluating)|we\s+have\s+(a\s+)?team|our\s+(company|organization))\b",
    ])
    internal_score = 1
    if internal_c >= 3: internal_score = 4
    elif internal_c >= 2: internal_score = 3
    elif internal_c >= 1: internal_score = 2
    internal_ev = _quote_from(c_text, [r"\b(internally|our\s+team|we\s+need\s+to\s+(check|discuss)|we\s+are\s+using)\b"])
    internal_reason = (
        f"Prospect referenced internal team/buying process {internal_c} time(s) — buying signal."
        if internal_c >= 1 else
        "No internal discussion signals detected from prospect side."
    )

    # ── CLOSE: mixed text ────────────────────────────────────────────────────

    # Clear next step: explicit follow-up action agreed
    ns_c = _cnt_in(t, [
        r"\b(next\s+step|follow.?up|i.ll\s+send|we.ll\s+(send|share|connect|schedule))\b",
        r"\b(poc|pilot|trial|benchmark\s+doc|battle\s+card|proposal)\b",
        r"\b(schedule\s+(a\s+)?(call|meeting|demo)|let.s\s+(connect|reconvene|catch\s+up))\b",
    ])
    # Is there a concrete commitment or just vague promises?
    vague_ns = _has_in(t, r"\b(i.ll\s+send\s+you|will\s+share|will\s+provide)\b") and \
               not _has_in(t, r"\b(by\s+(monday|friday|end\s+of\s+(week|month)|next\s+week|tomorrow)|specific\s+date)\b")
    ns_score = 1
    if ns_c >= 3 and not vague_ns: ns_score = 4
    elif ns_c >= 2: ns_score = 3
    elif ns_c >= 1: ns_score = 2
    if vague_ns and ns_score > 2: ns_score = 2  # vague promise without date → cap at 2
    ns_ev = _quote_from(t, [r"\b(next\s+step|i.ll\s+send|follow.?up|poc|pilot|schedule)\b"])
    ns_reason = (
        f"Next steps mentioned {ns_c} time(s)."
        + (" However, no specific date or owner was assigned — remains a vague promise." if vague_ns else "")
        if ns_c >= 1 else
        "No clear next step was defined; deal closure momentum is at risk."
    )

    # Timeline established: specific date/deadline agreed
    tl_c = _cnt_in(t, [
        r"\b(by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b",
        r"\b(by\s+(end\s+of|next)\s+(week|month|quarter))\b",
        r"\b(by\s+(tomorrow|today|tonight|this\s+(afternoon|morning|evening)))\b",
        r"\b(deadline|specific\s+date|due\s+(date|by)|when\s+do\s+you\s+need\s+(this|it))\b",
    ])
    tl_score = 1
    if tl_c >= 2: tl_score = 4
    elif tl_c >= 1: tl_score = 3
    tl_ev = _quote_from(t, [r"\b(by\s+(next|end\s+of)|deadline|due\s+date)\b"])
    tl_reason = (
        f"A timeline or deadline was established {tl_c} time(s)."
        if tl_c >= 1 else
        "No specific timeline or deadline was established; without a date, next steps may stall."
    )

    # Mutual action plan: joint commitments from both sides
    map_c = _cnt_in(t, [
        r"\b(from\s+(our|your)\s+side|on\s+(our|your)\s+end)\b",
        r"\b(we.ll\s+do\s+X\s+and\s+you.ll|you.ll\s+do\s+X\s+and\s+we.ll)\b",
        r"\b(mutual\s+action\s+plan|shared\s+commitment|both\s+sides|joint\s+plan)\b",
        r"\b(checklist|action\s+items?|agreed\s+actions?)\b",
    ])
    map_score = 1
    if map_c >= 3: map_score = 4
    elif map_c >= 2: map_score = 3
    elif map_c >= 1: map_score = 2
    map_ev = _quote_from(t, [r"\b(mutual|action\s+plan|from\s+our\s+side|from\s+your\s+side)\b"])
    map_reason = (
        f"Mutual action plan signals found {map_c} time(s)."
        if map_c >= 1 else
        "No mutual action plan established; responsibility for next steps is unclear and one-sided."
    )

    return {
        "Pain identification":              _kpi(pain_score, pain_reason, pain_ev),
        "Current infra and state mapping":  _kpi(infra_score, infra_reason, infra_ev),
        "Stakeholder mapping":              _kpi(stakeholder_score, stakeholder_reason, stkh_ev),
        "Competition identification":       _kpi(comp_score, comp_reason, comp_ev),
        "Agenda setting":                   _kpi(agenda_score, agenda_reason, agenda_ev),
        "Personalisation":                  _kpi(personal_score, personal_reason, personal_ev),
        "Active listening signals":         _kpi(listen_score, listen_reason, listen_ev),
        "Talk-to-listen ratio":             _kpi(ratio_score, ratio_reason, ratio_ev),
        "Relevance of demo flow":           _kpi(flow_score, flow_reason, flow_ev),
        "Story-based narrative":            _kpi(story_score, story_reason, story_ev),
        "Value articulation":               _kpi(value_score, value_reason, value_ev),
        "Handling technical Qs":            _kpi(tech_score, tech_reason, tech_ev),
        "Objection recognition":            _kpi(obj_rec_score, obj_reason, obj_ev),
        "Resolution quality":               _kpi(res_score, res_reason, res_ev),
        "Competitor handling":              _kpi(diff_score, diff_reason, diff_ev),
        "Price / ROI discussion":           _kpi(roi_score, roi_reason, roi_ev),
        "Questions asked by prospect":      _kpi(q_score, q_reason, q_ev[:120] if isinstance(q_ev, str) else "N/A"),
        "Use case confirmation":            _kpi(uc_score, uc_reason, uc_ev),
        "Sentiment tone":                   _kpi(sent_score, sent_reason, "N/A"),
        "Internal mention":                 _kpi(internal_score, internal_reason, internal_ev),
        "Clear next step set":              _kpi(ns_score, ns_reason, ns_ev),
        "Timeline established":             _kpi(tl_score, tl_reason, tl_ev),
        "Mutual action plan":               _kpi(map_score, map_reason, map_ev),
    }


def _score_risks_heuristic(text: str, signals: dict) -> dict:
    """
    Detect the 4 risk flags using speaker-aware patterns.
    Feature gaps and unresolved objections are evaluated against presenter responses.
    Disengagement is detected from client speech only.
    """
    t = text or ""
    p_text = signals.get("presenter_text") or t
    c_text = signals.get("client_text") or ""

    # Feature gaps: client asked about something presenter couldn't support or deferred
    feature_gap = (
        _has_in(p_text, r"\b(i.ll\s+(check|get\s+back|follow\s+up)|will\s+share|battle\s+card|benchmark\s+doc|comparison\s+document)\b")
        or _has_in(t, r"\b(doesn.t\s+support|not\s+available|not\s+there\s+yet|on\s+the\s+roadmap|gap|limitation|workaround\s+needed)\b")
    )
    feature_ev = (
        _find_quote(p_text, [r"\b(i.ll\s+(check|get\s+back)|battle\s+card|benchmark|doesn.t\s+support|not\s+available)\b"])
    )

    # Budget concerns: client or presenter raised cost/pricing concerns
    budget = _has_in(t, r"\b(budget\s+(concern|constraint|issue|limit)|too\s+(expensive|costly)|can\s+we\s+(afford|negotiate\s+the\s+price)|pricing\s+(issue|concern|problem)|cost\s+is\s+(too\s+)?high)\b")
    budget_ev = _find_quote(t, [r"\b(budget\s+concern|too\s+expensive|afford|negotiate|cost\s+is\s+high)\b"])

    # Disengagement: from CLIENT text — confusion, frustration, pace issues
    disengaged = (
        _has_in(c_text, r"\b(speak\s+(slowly|slower)|slow\s+down|too\s+fast|can\s+you\s+(repeat|go\s+back|say\s+that\s+again))\b")
        or _has_in(c_text, r"\b(lost\s+(me|track)|not\s+following|confused|didn.t\s+(understand|catch\s+that)|what\s+do\s+you\s+mean)\b")
    )
    disengaged_ev = (
        _find_quote(c_text, [r"\b(speak\s+slowly|slow\s+down|repeat|go\s+back|confused|not\s+following|lost\s+me)\b"])
    )

    # Unresolved objections: competitor/concern was raised but NOT resolved in-call
    comp_raised = _has_in(t, r"\b(intune|servicenow|jira|zendesk|splunk|datadog|dynatrace|pagerduty|glpi|solarwinds|freshservice|nagios|zabbix|prtg)\b")
    comp_resolved = _has_in(p_text, r"\b(unlike\s+\w+|compared\s+to\s+\w+|our\s+advantage|differentiator|we\s+(handle|support)\s+this\s+(natively|differently))\b")
    unresolved = comp_raised and not comp_resolved
    unresolved_ev = (
        _find_quote(t, [r"\b(intune|glpi|servicenow|jira|zendesk|splunk|datadog)\b"])
    )

    return {
        "Feature gaps raised":    {"present_boolean": feature_gap, "evidence_quote": feature_ev if feature_gap else "Not detected"},
        "Budget concern signals":  {"present_boolean": budget,      "evidence_quote": budget_ev if budget else "Not detected"},
        "Disengagement moments":   {"present_boolean": disengaged,  "evidence_quote": disengaged_ev if disengaged else "Not detected"},
        "Unresolved objections":   {"present_boolean": unresolved,  "evidence_quote": unresolved_ev if unresolved else "Not detected"},
    }


# ─── Language detection & translation ───────────────────────────────────────

def _detect_language(text: str) -> str:
    """
    Detect the language of the transcript text.
    Returns an ISO 639-1 code (e.g. 'en', 'hi', 'gu', 'fr') or 'en' on failure.
    """
    try:
        from langdetect import detect
        sample = (text or "").strip()[:3000]
        if not sample:
            return "en"
        return detect(sample)
    except Exception:
        return "en"


def _translate_chunk(chunk: str, src: str) -> str:
    """Translate a single text chunk to English."""
    from deep_translator import GoogleTranslator
    try:
        return GoogleTranslator(source=src, target="en").translate(chunk) or chunk
    except Exception:
        return chunk


def _translate_to_english(text: str, src_lang: str = "auto") -> str:
    """
    Translate arbitrary-length text to English in 4500-char chunks.
    Splits on sentence boundaries when possible to avoid cutting mid-sentence.
    """
    t = (text or "").strip()
    if not t:
        return t

    max_chunk = 4500
    if len(t) <= max_chunk:
        return _translate_chunk(t, src_lang)

    # Split into chunks respecting sentence endings
    sentences = re.split(r'(?<=[.!?\n])\s+', t)
    chunks, current = [], ""
    for sent in sentences:
        if len(current) + len(sent) + 1 > max_chunk:
            if current:
                chunks.append(current.strip())
            current = sent
        else:
            current = (current + " " + sent).strip() if current else sent
    if current:
        chunks.append(current.strip())

    translated_parts = [_translate_chunk(c, src_lang) for c in chunks]
    return " ".join(translated_parts)


def _translate_raw_transcript(raw: str, src_lang: str) -> str:
    """
    Translate transcript to English while preserving speaker labels.
    Works for both Teams VTT (<v Speaker>text</v>) and 'Speaker: text' formats.
    Returns translated text in 'Speaker: text' format (understood by all downstream code).
    """
    pairs = _parse_speaker_lines(raw)
    if not pairs:
        # No speaker structure found — translate as plain text
        return _translate_to_english(_clean_vtt(raw), src_lang)

    translated_lines = []
    # Batch-translate all utterances in one pass to reduce API calls
    utterances = [u for _, u in pairs]
    speakers   = [s for s, _ in pairs]

    # Translate in chunks of 30 utterances joined by a delimiter
    DELIM = " ||| "
    batch_size = 30
    translated_utterances = []
    for i in range(0, len(utterances), batch_size):
        batch = utterances[i : i + batch_size]
        joined = DELIM.join(batch)
        translated_joined = _translate_chunk(joined, src_lang)
        # Split back — if translation collapsed delimiters, fall back per-utterance
        parts = translated_joined.split(DELIM)
        if len(parts) == len(batch):
            translated_utterances.extend(parts)
        else:
            # Fallback: translate individually
            for u in batch:
                translated_utterances.append(_translate_chunk(u, src_lang))

    for speaker, t_utterance in zip(speakers, translated_utterances):
        label = speaker if speaker else "Speaker"
        translated_lines.append(f"{label}: {t_utterance.strip()}")

    return "\n".join(translated_lines)


# Language names for reporting
_LANG_NAMES = {
    "af": "Afrikaans", "ar": "Arabic", "bg": "Bulgarian", "bn": "Bengali",
    "cs": "Czech", "da": "Danish", "de": "German", "el": "Greek",
    "en": "English", "es": "Spanish", "et": "Estonian", "fa": "Persian",
    "fi": "Finnish", "fr": "French", "gu": "Gujarati", "he": "Hebrew",
    "hi": "Hindi", "hr": "Croatian", "hu": "Hungarian", "id": "Indonesian",
    "it": "Italian", "ja": "Japanese", "ko": "Korean", "lt": "Lithuanian",
    "lv": "Latvian", "mk": "Macedonian", "ml": "Malayalam", "mr": "Marathi",
    "nl": "Dutch", "no": "Norwegian", "pa": "Punjabi", "pl": "Polish",
    "pt": "Portuguese", "ro": "Romanian", "ru": "Russian", "sk": "Slovak",
    "sl": "Slovenian", "sq": "Albanian", "sr": "Serbian", "sv": "Swedish",
    "sw": "Swahili", "ta": "Tamil", "te": "Telugu", "th": "Thai",
    "tl": "Filipino", "tr": "Turkish", "uk": "Ukrainian", "ur": "Urdu",
    "vi": "Vietnamese", "zh-cn": "Chinese (Simplified)", "zh-tw": "Chinese (Traditional)",
}


def _lang_name(code: str) -> str:
    return _LANG_NAMES.get(code, code.upper())


# ─── Pure-Python local fallback (no PyTorch / NumPy / Transformers) ─────────

def _analyze_with_local(transcript_text: str) -> dict:
    """
    Fast, fully self-contained analysis using only Python stdlib.
    Auto-detects transcript language and translates to English before scoring
    so all 23 KPIs work correctly for any language.
    Handles both standard "Name: text" and Teams VTT <v Speaker>text</v> formats.
    """
    raw = transcript_text.strip()

    # ── Language detection & translation ──────────────────────────────────────
    clean_for_detect = _clean_vtt(raw)
    detected_lang = _detect_language(clean_for_detect)
    is_english = detected_lang in ("en",)

    if not is_english:
        print(f"[analysis] Detected language: {_lang_name(detected_lang)} ({detected_lang}). Translating to English…")
        # Translate the raw transcript (preserves speaker structure → "Speaker: text" format)
        raw = _translate_raw_transcript(raw, detected_lang)
        print(f"[analysis] Translation complete.")

    # ── Standard analysis pipeline (always on English from here) ──────────────
    text = _clean_vtt(raw)
    questions = _detect_questions(text)
    base_sent = _analyze_sentiment_high_accuracy(text)
    sent_obj = _sentiment_score_rule_based(text)
    sentiment = sent_obj.get("label") or base_sent
    client_name = _detect_client_name(text)
    product_name = _detect_product_name(text)
    summary = _extract_summary(text)
    signals = _extract_signals(raw)
    pros, cons, tips = _extract_pros_cons_tips(text, questions, sentiment)
    qa_pairs = _extract_qa_pairs(raw)

    quality_parts = []
    quality_parts.append(f"Sentiment (overall): {sentiment}. Timeline: {', '.join(sent_obj.get('timeline') or [])}. Score: {sent_obj.get('score')}.")
    for r in sent_obj.get("rationale") or []:
        quality_parts.append(r)
    if not is_english:
        quality_parts.append(f"Language: transcript was in {_lang_name(detected_lang)} and auto-translated to English for scoring.")
    if questions:
        quality_parts.append(f"Engagement: client asked {len(questions)} question(s).")
    if signals.get("has_next_steps"):
        quality_parts.append("Momentum: next steps were mentioned.")
    else:
        quality_parts.append("Momentum risk: next steps were not clearly captured (owner/date/action).")
    if signals.get("has_pricing"):
        quality_parts.append("Commercials: pricing/budget was discussed.")
    if signals.get("has_security"):
        quality_parts.append("Risk: security/compliance was discussed.")
    if signals.get("has_integration"):
        quality_parts.append("Technical fit: integrations/API/SSO topics were discussed.")
    if pros:
        quality_parts.append("Strengths: the report includes concrete delivery positives.")
    if cons:
        quality_parts.append("Gaps: the report includes concrete risks/unknowns to address.")

    structured_details = _score_kpis_heuristic(text, signals)
    risk_flags = _score_risks_heuristic(text, signals)

    return {
        "clientName": client_name,
        "productName": product_name,
        "summary": summary,
        "pros": pros,
        "cons": cons,
        "tips": tips,
        "sentiment": sentiment,
        "questionsCount": len(questions),
        "questionsDetected": questions,
        "qaPairs": qa_pairs,
        "demoQualityEvaluation": " ".join(quality_parts),
        "structuredDetails": structured_details,
        "riskFlags": risk_flags,
        "kpiGaps": {},
        "detectedLanguage": detected_lang,
        "detectedLanguageName": _lang_name(detected_lang),
        "translatedToEnglish": not is_english,
    }


# ─── Main entry point ────────────────────────────────────────────────────────

def analyze_transcript(transcript_text: str) -> dict:
    transcript_text = (transcript_text or "").strip()
    if not transcript_text:
        return {
            "clientName": "",
            "productName": "",
            "summary": "",
            "pros": [],
            "cons": [],
            "tips": [],
            "sentiment": "neutral",
            "questionsCount": 0,
            "questionsDetected": [],
            "qaPairs": [],
            "demoQualityEvaluation": "",
        }

    # Try Claude first (preferred), then OpenAI, then local heuristics as fallback.
    allow_claude = os.getenv("ALLOW_CLAUDE_ANALYSIS", "").lower() in ("1", "true", "yes", "y", "on")
    if allow_claude and os.getenv("ANTHROPIC_API_KEY"):
        try:
            print("[analysis] Using Claude for transcript analysis")
            return _analyze_with_claude(transcript_text)
        except Exception as e:
            print(f"[analysis] Claude failed ({e}), trying next option")

    allow_openai = os.getenv("ALLOW_OPENAI_ANALYSIS", "").lower() in ("1", "true", "yes", "y", "on")
    if allow_openai and os.getenv("OPENAI_API_KEY"):
        try:
            print("[analysis] Using OpenAI for transcript analysis")
            return _analyze_with_openai(transcript_text)
        except Exception as e:
            print(f"[analysis] OpenAI failed ({e}), using local fallback")

    print("[analysis] Using local heuristic analysis")
    return _analyze_with_local(transcript_text)
