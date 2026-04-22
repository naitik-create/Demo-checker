"""
Demo Meeting Transcript Analysis Service
Pure-Python fallback (no PyTorch / NumPy / Transformers required).
Uses OpenAI GPT when OPENAI_API_KEY is set, otherwise uses fast keyword-based analysis.
"""
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
    Avoid quoting transcript lines; we only use counts/presence.
    """
    t = text or ""
    signals = {}

    # Core topics
    signals["has_pricing"] = bool(re.search(r"\b(pricing|price|cost|budget|roi|expensive|license)\b", t, re.I))
    signals["has_security"] = bool(re.search(r"\b(security|compliance|soc\s*2|iso|gdpr|hipaa|risk)\b", t, re.I))
    signals["has_integration"] = bool(re.search(r"\b(integration|integrate|api|webhook|sso|oauth|azure|okta|salesforce|crm|erp)\b", t, re.I))
    signals["has_timeline"] = bool(re.search(r"\b(timeline|when|by\s+\w+day|this\s+week|next\s+week|month|quarter|deadline)\b", t, re.I))
    signals["has_next_steps"] = bool(re.search(r"\b(next\s+step|follow[-\s]?up|send\s+(a\s+)?proposal|pilot|poc|trial|schedule|book|calendar|demo\s+again)\b", t, re.I))
    signals["has_competitor"] = bool(re.search(r"\b(competitor|alternative|versus|vs\.?|compare|already\s+use|currently\s+using)\b", t, re.I))
    signals["has_decision"] = bool(re.search(r"\b(decision|approve|sign[-\s]?off|procurement|legal|stakeholder)\b", t, re.I))

    # Discovery / structure
    signals["mentions_pain"] = bool(re.search(r"\b(problem|challenge|pain\s+point|issue|currently|today\s+we)\b", t, re.I))
    signals["mentions_use_case"] = bool(re.search(r"\b(use\s+case|workflow|scenario|example|case\s+study)\b", t, re.I))
    signals["mentions_value"] = bool(re.search(r"\b(value|benefit|outcome|impact|save\s+time|reduce|increase)\b", t, re.I))

    # Engagement cues (non-sentiment)
    signals["questions"] = _detect_questions(t)
    signals["questions_count"] = len(signals["questions"])

    # Simple talk-balance estimation (requires speaker labels)
    pairs = _parse_speaker_lines(t)
    if pairs:
        client_tokens = 0
        consultant_tokens = 0
        for sp, ut in pairs:
            sp_l = (sp or "").lower()
            tokens = len(_norm(ut).split())
            if "client" in sp_l or "customer" in sp_l or "prospect" in sp_l:
                client_tokens += tokens
            elif "consultant" in sp_l or "presenter" in sp_l or "sales" in sp_l:
                consultant_tokens += tokens
        total = max(1, client_tokens + consultant_tokens)
        signals["client_talk_ratio"] = round(client_tokens / total, 3)
    else:
        signals["client_talk_ratio"] = None

    return signals


def _parse_speaker_lines(text: str) -> list:
    """
    Parse transcript into [(speaker, utterance)].
    Supports formats like:
      "Client: ...", "Consultant: ...", "Speaker 1: ...", "Name: ..."
    """
    pairs = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^([A-Za-z][A-Za-z0-9 _-]{1,30})\s*:\s*(.+)$", line)
        if m:
            speaker = m.group(1).strip()
            utter = m.group(2).strip()
            pairs.append((speaker, utter))
        else:
            # Continuation line
            if pairs:
                pairs[-1] = (pairs[-1][0], (pairs[-1][1] + " " + line).strip())
            else:
                pairs.append(("", line))
    return pairs


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
    Produce pros/cons/tips as synthesized insights (NOT transcript quote chunks).
    """
    signals = _extract_signals(text)
    q_count = int(len(questions) or signals.get("questions_count") or 0)

    pros = []
    cons = []
    tips = []

    sent = str(sentiment or "").lower()
    is_pos = sent == "positive"
    is_neg = sent == "negative"

    # PROS (what went well)
    if is_pos:
        pros.append("Client reaction shows positive engagement and forward evaluation of the solution.")
    else:
        pros.append("The meeting maintained a professional, structured flow with workable product clarity.")

    if signals.get("has_integration"):
        pros.append("Technical fit was addressed with integration/connectivity topics, reducing uncertainty on feasibility.")
    if signals.get("has_security"):
        pros.append("Security/compliance concerns were acknowledged, showing the client’s governance requirements were considered.")
    if signals.get("has_pricing"):
        pros.append("Commercial discussion appeared at least partially in-scope, helping align expectations on value/ROI.")
    if q_count > 0:
        pros.append("Client questions indicate active evaluation; the consultant had opportunities to clarify outcomes and usage.")
    if signals.get("has_next_steps"):
        pros.append("Momentum was created through follow-ups (proposal/pilot/POC/scheduling cues).")

    # CONS (what needs improvement)
    if not signals.get("has_next_steps"):
        cons.append("Next steps were not explicit (missing owner/date/action), so follow-through risk is high.")
    if not signals.get("has_pricing"):
        cons.append("Pricing/ROI specifics were not captured; a separate commercial alignment may be required.")
    if not signals.get("mentions_pain"):
        cons.append("Client pain/problem framing appears limited; additional discovery is needed to anchor the business case.")
    if signals.get("has_competitor"):
        cons.append("Competitive context/alternatives were raised; differentiation and proof points should be prepared.")
    if q_count >= 4:
        cons.append("High question volume suggests the client is still validating fit; strengthen the FAQ and evidence package.")
    if is_neg:
        cons.append("The tone suggests concerns or hesitation; address the highest-friction objections directly and early.")

    # Ensure minimum list sizes with safe generic insights (no transcript quotes)
    while len(pros) < 5:
        pros.append("Overall narrative indicates the demo covered relevant areas, but depth can be improved with stronger evidence.")
        if len(pros) >= 6:
            break
    while len(cons) < 5:
        cons.append("Some requirements/decisions remain implicit and should be confirmed with explicit next actions.")
        if len(cons) >= 6:
            break

    # TIPS (coaching playbook)
    if not signals.get("has_next_steps"):
        tips.append("Close the loop: propose a concrete next step with owner + exact date/time (e.g., pilot kickoff).")
    if not signals.get("has_pricing"):
        tips.append("Prepare a value/ROI + pricing justification pack (cost drivers, business impact, and expected outcomes).")
    if signals.get("has_competitor"):
        tips.append("Add a comparison slide and 2–3 differentiators tied to the client’s stated priorities and risks.")
    if signals.get("has_security"):
        tips.append("Provide a lightweight compliance/security overview (controls, data handling, and audit readiness).")
    if signals.get("has_integration"):
        tips.append("Send a technical integration outline (APIs, SSO approach, timeline, and required access/settings).")
    if q_count >= 4:
        tips.append("Create a demo Q&A follow-up document covering the client’s questions and clear, concise answers.")
    tips.append("End with an agreed agenda for the next meeting: confirmation of requirements, success criteria, and commitments.")

    # Cap sizes for UI cleanliness.
    return pros[:8], cons[:8], tips[:10]


# ─── OpenAI GPT analysis (used when OPENAI_API_KEY is set) ──────────────────

def _analyze_with_openai(transcript_text: str) -> dict:
    from openai import OpenAI

    client = OpenAI()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Chunked approach: extract evidence per chunk, then consolidate.
    chunk_chars = int(os.getenv("OPENAI_CHUNK_CHARS", "12000"))
    overlap = int(os.getenv("OPENAI_CHUNK_OVERLAP", "600"))
    chunks = _chunk_text(transcript_text, chunk_chars=chunk_chars, overlap=overlap)

    extract_prompt = (
        "You analyze a chunk of a Microsoft Teams product demo transcript.\n\n"
        "Return ONLY valid JSON with keys:\n"
        "- facts: string[] (6-15 factual bullets: what was discussed/decided; include numbers, constraints)\n"
        "- prosEvidence: string[] (3-10 bullets: strong moments + short quote fragments)\n"
        "- consEvidence: string[] (3-10 bullets: objections/risks/unclear points + short quote fragments)\n"
        "- nextStepsEvidence: string[] (0-8 bullets: follow-ups, owners, dates if present)\n"
        "- questions: string[] (up to 15 client questions as short quotes)\n"
        "- qaPairs: object[] (up to 10 sequential pairs {question, answer, tip} if speaker labels allow)\n"
        "- sentimentSignals: string[] (up to 10 short quote fragments that indicate sentiment)\n\n"
        "Rules: Use only the given chunk. Do NOT invent. Prefer quotes/fragments for evidence.\n"
    )

    extracted = []
    for idx, ch in enumerate(chunks, start=1):
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": extract_prompt},
                {"role": "user", "content": f"CHUNK {idx}/{len(chunks)}:\n\n{ch}"},
            ],
        )
        content = (resp.choices[0].message.content or "{}").strip()
        if content.startswith("```") and content.endswith("```"):
            content = content.strip("` \n")
            if content.lower().startswith("json"):
                content = content[4:].strip()
        try:
            extracted.append(json.loads(content))
        except Exception:
            extracted.append({})

    consolidate_prompt = (
        "You consolidate extracted notes from multiple transcript chunks into one final report.\n\n"
        "Return ONLY valid JSON with keys:\n"
        "- clientName: string (company/person, or empty)\n"
        "- productName: string (product being demoed, or empty)\n"
        "- summary: string (8-14 bullets or sentences; detailed but readable; cover agenda, needs, solution, objections, next steps)\n"
        "- pros: string[] (6-12 bullets; concrete; no fluff)\n"
        "- cons: string[] (6-12 bullets; concrete; include risks/unknowns)\n"
        "- tips: string[] (8-14 highly actionable coaching tips; tie to cons and next steps)\n"
        "- sentiment: \"positive\" | \"neutral\" | \"negative\"\n"
        "- questionsCount: number\n"
        "- questionsDetected: string[] (up to 25)\n"
        "- qaPairs: object[] (up to 20; each has question, answer, tip)\n"
        "- demoQualityEvaluation: string (6-10 sentences; structured: what went well, what to fix, what to do next)\n\n"
        "Rules:\n"
        "- Use ONLY the extracted notes provided.\n"
        "- Prefer evidence-based bullets. Avoid generic statements.\n"
        "- If info is missing, say it is missing (do not invent).\n"
    )

    resp2 = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": consolidate_prompt},
            {"role": "user", "content": json.dumps({"chunks": extracted})[:200000]},
        ],
    )

    content = (resp2.choices[0].message.content or "{}").strip()
    content = content.strip()
    if content.startswith("```") and content.endswith("```"):
        content = content.strip("` \n")
        if content.lower().startswith("json"):
            content = content[4:].strip()

    try:
        data = json.loads(content)
    except Exception as e:
        print(f"[analysis] JSON parse failed: {e}. Content: {content[:200]}")
        data = {}

    sentiment = data.get("sentiment", "neutral")
    if sentiment not in ("positive", "neutral", "negative"):
        sentiment = "neutral"

    return {
        "clientName": (data.get("clientName") or "").strip(),
        "productName": (data.get("productName") or "").strip(),
        "summary": (data.get("summary") or "").strip(),
        "pros": data.get("pros") or [],
        "cons": data.get("cons") or [],
        "tips": data.get("tips") or [],
        "sentiment": sentiment,
        "questionsCount": int(data.get("questionsCount") or 0),
        "questionsDetected": data.get("questionsDetected") or _detect_questions(transcript_text),
        "qaPairs": data.get("qaPairs") or _extract_qa_pairs(transcript_text),
        "demoQualityEvaluation": (data.get("demoQualityEvaluation") or "").strip(),
    }


# ─── Pure-Python local fallback (no PyTorch / NumPy / Transformers) ─────────

def _analyze_with_local(transcript_text: str) -> dict:
    """
    Fast, fully self-contained analysis using only Python stdlib.
    Compatible with any NumPy/Python version — zero ML dependencies.
    """
    text = transcript_text.strip()
    questions = _detect_questions(text)
    # Combine transformer sentiment (if available) with a richer rule-based score.
    base_sent = _analyze_sentiment_high_accuracy(text)
    sent_obj = _sentiment_score_rule_based(text)
    sentiment = sent_obj.get("label") or base_sent
    client_name = _detect_client_name(text)
    product_name = _detect_product_name(text)
    summary = _extract_summary(text)
    signals = _extract_signals(text)
    pros, cons, tips = _extract_pros_cons_tips(text, questions, sentiment)
    qa_pairs = _extract_qa_pairs(text)

    quality_parts = []
    quality_parts.append(f"Sentiment (overall): {sentiment}. Timeline: {', '.join(sent_obj.get('timeline') or [])}. Score: {sent_obj.get('score')}.")
    for r in sent_obj.get("rationale") or []:
        quality_parts.append(r)
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

    # No-paid default: only use OpenAI when explicitly enabled.
    allow_openai = os.getenv("ALLOW_OPENAI_ANALYSIS", "").lower() in ("1", "true", "yes", "y", "on")
    if allow_openai and os.getenv("OPENAI_API_KEY"):
        try:
            return _analyze_with_openai(transcript_text)
        except Exception as e:
            print(f"[analysis] OpenAI failed ({e}), using local fallback")

    return _analyze_with_local(transcript_text)
