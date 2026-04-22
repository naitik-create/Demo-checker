import axios from "axios";
import {
  buildTeamsConnectUrl,
  buildTeamsConnectUrlForConsultant,
  exchangeCodeForTokens,
  parsePurposeFromState,
  teamsConnectRedirectUrl
} from "../services/msGraphAuthService.js";
import { getUserProfile, getUserCalendarMeetings } from "../services/userGraphService.js";
import { User } from "../models/index.js";
import { syncConsultantCalendarToDb } from "../services/calendarSyncService.js";

export function getTeamsConnectUrl(req, res, next) {
  try {
    const url = buildTeamsConnectUrl(req.user.id, req.user.email || undefined);
    res.json({ ok: true, url });
  } catch (err) {
    next(err);
  }
}

export async function oauthCallback(req, res) {
  const { code, state, error: msError, error_description: msErrorDesc, admin_consent } = req.query;

  // Parse state JWT early so error redirects go to the right page (consultant vs manager)
  const { purpose: statePurpose } = state ? parsePurposeFromState(String(state)) : { purpose: null };

  if (msError) {
    const rawDesc = (msErrorDesc || "").toString();
    const rawErr = (msError || "").toString();
    console.error("[Teams OAuth callback] Microsoft returned error:", rawErr, "|", rawDesc);

    let reason;
    if (rawErr === "access_denied" || rawDesc.includes("AADSTS65004") || rawDesc.includes("cancelled")) {
      reason = "consent_cancelled";
    } else if (rawDesc.includes("AADSTS65001") || rawDesc.includes("admin_consent_required") || rawDesc.includes("consent_required")) {
      reason = "admin_consent_required";
    } else if (rawDesc.includes("redirect_uri_mismatch") || rawErr.includes("redirect_uri_mismatch")) {
      reason = "redirect_uri_mismatch";
    } else if (rawDesc.includes("AADSTS70011")) {
      reason = "invalid_scope";
    } else {
      reason = rawDesc.slice(0, 200) || rawErr;
    }
    return res.redirect(teamsConnectRedirectUrl({ success: false, reason, purpose: statePurpose }));
  }

  if (admin_consent === "True" || admin_consent === "true") {
    console.log("[Teams OAuth callback] Admin consent granted org-wide.");
    return res.redirect(teamsConnectRedirectUrl({ success: false, reason: "admin_consent_granted_relogin", purpose: statePurpose }));
  }

  if (!code || !state) {
    return res.redirect(teamsConnectRedirectUrl({ success: false, reason: "missing_code_or_state", purpose: statePurpose }));
  }

  try {
    const { appUserId, purpose, accessToken, refreshToken, accessTokenExpiresAt } = await exchangeCodeForTokens(
      String(code),
      String(state)
    );

    console.log(`[Teams OAuth callback] Token exchange OK — userId=${appUserId} purpose=${purpose} hasRefreshToken=${Boolean(refreshToken)} hasAccessToken=${Boolean(accessToken)}`);

    if (!refreshToken) {
      console.error("[Teams OAuth callback] Microsoft did NOT return a refresh_token. Check that offline_access scope is consented and admin consent is granted in Azure portal.");
      return res.redirect(teamsConnectRedirectUrl({ success: false, reason: "no_refresh_token", purpose }));
    }

    let me = {};
    try {
      const meRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { $select: "id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone" }
      });
      me = meRes.data || {};
      console.log(`[Teams OAuth callback] Graph /me OK — upn=${me.userPrincipalName || me.mail} msId=${me.id}`);
    } catch (profileErr) {
      console.warn("[Teams OAuth callback] Could not fetch /me profile:", profileErr.message);
    }

    const [rowsUpdated] = await User.update(
      {
        msTenantId: me.tenantId || null,
        msUserId: me.id || null,
        msUpn: (me.userPrincipalName || me.mail || "").toLowerCase() || null,
        msDisplayName: me.displayName || null,
        msJobTitle: me.jobTitle || null,
        msDepartment: me.department || null,
        msOfficeLocation: me.officeLocation || null,
        msRefreshToken: refreshToken,
        msAccessToken: accessToken,
        msAccessTokenExpiresAt: accessTokenExpiresAt
      },
      { where: { id: appUserId } }
    );

    console.log(`[Teams OAuth callback] DB update complete — rowsUpdated=${rowsUpdated} userId=${appUserId}`);

    if (rowsUpdated === 0) {
      console.error(`[Teams OAuth callback] No rows updated! User with id=${appUserId} not found in DB.`);
      return res.redirect(teamsConnectRedirectUrl({ success: false, reason: "user_not_found_in_db", purpose }));
    }

    // Fire-and-forget: sync the consultant's calendar immediately after connecting
    syncConsultantCalendarToDb(appUserId)
      .then((r) => console.log(`[Teams OAuth callback] Auto-sync after connect: fetched=${r.fetched} upserted=${r.upsertedMeetings}`))
      .catch((e) => console.warn("[Teams OAuth callback] Auto-sync failed (non-fatal):", e?.message));

    // When a manager connects for a consultant, redirect back to manager page.
    // When self-connect, use the user's own role to pick the right dashboard.
    if (purpose === "teams_connect_consultant") {
      return res.redirect(teamsConnectRedirectUrl({ success: true, role: "manager" }));
    }
    const u = await User.findOne({ where: { id: appUserId }, attributes: ["role"] });
    return res.redirect(teamsConnectRedirectUrl({ success: true, role: u?.role }));
  } catch (err) {
    const msg = (err?.message || String(err)).slice(0, 200);
    console.error("[Teams OAuth callback] Error:", msg);
    return res.redirect(teamsConnectRedirectUrl({ success: false, reason: msg, purpose: statePurpose }));
  }
}

export async function getConsultantTeamsConnectUrl(req, res, next) {
  try {
    const { consultantId } = req.params;
    if (!consultantId) {
      const err = new Error("Consultant ID is required");
      err.status = 400;
      throw err;
    }
    const consultant = await User.findOne({ where: { id: consultantId }, attributes: ["id", "role", "email"] });
    if (!consultant || consultant.role !== "consultant") {
      const err = new Error("Consultant not found");
      err.status = 404;
      throw err;
    }
    const url = buildTeamsConnectUrlForConsultant({
      managerUserId: req.user.id,
      consultantUserId: consultantId,
      loginHint: consultant.email || undefined
    });
    res.json({ ok: true, url });
  } catch (err) {
    next(err);
  }
}

export async function getMyTeamsData(req, res, next) {
  try {
    const userId = req.user.id;
    const u = await User.findOne({
      where: { id: userId },
      attributes: ["msUpn", "msDisplayName", "msJobTitle", "msDepartment", "msOfficeLocation", "msRefreshToken", "msAccessToken", "msAccessTokenExpiresAt", "msUserId"]
    });

    if (!u?.msRefreshToken) {
      return res.json({ ok: true, connected: false, profile: null, calendarMeetings: [], onlineMeetings: [] });
    }

    const [profile, calendarMeetings] = await Promise.all([
      getUserProfile(userId).catch((e) => { console.warn("[getMyTeamsData] profile failed:", e.message); return null; }),
      getUserCalendarMeetings(userId, { pastDays: 7, futureDays: 14 }).catch((e) => { console.warn("[getMyTeamsData] calendarMeetings failed:", e.message); return []; })
    ]);

    res.json({
      ok: true,
      connected: true,
      profile: profile
        ? { id: profile.id, displayName: profile.displayName, email: profile.mail || profile.userPrincipalName, jobTitle: profile.jobTitle, department: profile.department, officeLocation: profile.officeLocation, phone: profile.mobilePhone }
        : { id: u.msUserId, displayName: u.msDisplayName, email: u.msUpn, jobTitle: u.msJobTitle, department: u.msDepartment, officeLocation: u.msOfficeLocation },
      calendarMeetings
    });
  } catch (err) {
    next(err);
  }
}

export async function getConsultantTeamsData(req, res, next) {
  try {
    const { consultantId } = req.params;
    const u = await User.findOne({
      where: { id: consultantId },
      attributes: ["id", "name", "email", "msUpn", "msDisplayName", "msJobTitle", "msDepartment", "msOfficeLocation", "msRefreshToken", "msUserId"]
    });
    if (!u) {
      const err = new Error("Consultant not found");
      err.status = 404;
      throw err;
    }

    if (!u.msRefreshToken) {
      return res.json({ ok: true, connected: false, consultant: { id: consultantId, name: u.name, email: u.email }, profile: null, calendarMeetings: [], onlineMeetings: [] });
    }

    const fromQ = req.query.from;
    const toQ = req.query.to;
    let calendarOpts = { pastDays: 7, futureDays: 14 };
    if (typeof fromQ === "string" && typeof toQ === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ)) {
      const start = new Date(`${fromQ}T00:00:00.000Z`);
      const end = new Date(`${toQ}T23:59:59.999Z`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        calendarOpts = { startDateTime: start.toISOString(), endDateTime: end.toISOString() };
      }
    } else if (req.query.pastDays != null || req.query.futureDays != null) {
      calendarOpts = {
        pastDays: Math.min(365, Math.max(1, Number(req.query.pastDays) || 7)),
        futureDays: Math.min(365, Math.max(0, Number(req.query.futureDays) || 14))
      };
    }

    const [profile, calendarMeetings] = await Promise.all([
      getUserProfile(consultantId).catch(() => null),
      getUserCalendarMeetings(consultantId, calendarOpts).catch(() => [])
    ]);

    res.json({
      ok: true,
      connected: true,
      consultant: { id: consultantId, name: u.name, email: u.email },
      profile: profile
        ? { displayName: profile.displayName, email: profile.mail || profile.userPrincipalName, jobTitle: profile.jobTitle, department: profile.department, officeLocation: profile.officeLocation }
        : { displayName: u.msDisplayName, email: u.msUpn, jobTitle: u.msJobTitle, department: u.msDepartment, officeLocation: u.msOfficeLocation },
      calendarMeetings
    });
  } catch (err) {
    next(err);
  }
}
