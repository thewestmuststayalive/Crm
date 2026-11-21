import "server-only";

// Afsendelse af e-mails via Resend (resend.com, EU-region muligt). Sættes op med
// RESEND_API_KEY og EMAIL_FROM. Uden opsætning sendes intet, og funktionerne falder
// tilbage til manuel håndtering (fx midlertidig adgangskode ved nye medlemmer).

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

type Email = { to: string; subject: string; html: string; text: string };

export async function sendEmail(email: Email): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) return { sent: false };
  const base = (process.env.RESEND_API_URL ?? "https://api.resend.com").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, ...email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("E-mail blev afvist", res.status, await res.text().catch(() => ""));
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error("E-mail kunne ikke sendes", error);
    return { sent: false };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Brandet e-mail med overskrift, tekstafsnit og evt. knap. Al tekst escapes.
 * Returnerer både HTML og ren tekst (til e-mailprogrammer uden HTML).
 */
export function brandedEmail(opts: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  footer?: string;
}) {
  const p = opts.paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2937">${escapeHtml(t)}</p>`)
    .join("");
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:#1b6257;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(opts.button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#6b7280">Virker knappen ikke? Kopiér denne adresse: ${escapeHtml(opts.button.url)}</p>`
    : "";
  const footer = escapeHtml(opts.footer ?? "Sendt af Kundespor – alle kunder samlet, ingen glemt.");

  const html = `<!doctype html><html lang="da"><body style="margin:0;background:#f5f7f6;font-family:Inter,Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f6;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0a2622;padding:20px 28px"><span style="color:#ffffff;font-size:18px;font-weight:700">Kundespor</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#0a2622">${escapeHtml(opts.heading)}</h1>
${p}${button}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [opts.heading, "", ...opts.paragraphs, ...(opts.button ? ["", `${opts.button.label}: ${opts.button.url}`] : []), "", opts.footer ?? "Sendt af Kundespor"].join("\n");
  return { html, text };
}
