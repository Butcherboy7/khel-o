"""The three community emails (a, b, c), as HTML plus a plain-text copy.

Written to stay out of spam and out of Gmail's Promotions tab:
* a real person signs it, one clear link, no shouting, no exclamation marks;
* every link goes to khel-o.com (no shorteners) and is tagged so the admin Numbers
  tab shows which email brought people in (utm_campaign=community-a / -b / -c);
* the image has a size and alt text, and there is only one;
* a plain-text version travels with the HTML, and the footer says why they got it.
Only things that are true go in: Tekken Challenge #01 had 12 players, 12 matches
and one champion; the community is free; the poll is live.
"""
import html as _html
from dataclasses import dataclass

from app.config import settings

VARIANTS = ("a", "b", "c")

SUBJECTS = {
    "a": "12 players, 1 champion. You missed it.",
    "b": "Which game should Challenge #02 be?",
    "c": "Quick one from KHEL-O",
}
PREHEADERS = {
    "a": "Tekken Challenge #01 at AdamsDen. #02 reaches the community first.",
    "b": "Your vote picks our next challenge.",
    "c": "We ran our first Tekken night. Want in on the next?",
}

_RED = "#D0463C"
_INK = "#1F2430"
_BODY = "#3A3D46"
_MUTED = "#63676F"
_BG = "#F6F1E9"
_LINE = "#E7E0D4"
_FONT = "Arial,Helvetica,sans-serif"


@dataclass
class Rendered:
    subject: str
    preheader: str
    html: str
    text: str


def _front() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def community_link(variant: str, content: str, anchor: str = "") -> str:
    return (
        f"{_front()}/community?utm_source=email&utm_medium=email"
        f"&utm_campaign=community-{variant}&utm_content={content}{anchor}"
    )


def _e(value: str) -> str:
    return _html.escape(value, quote=True)


def _shell(preheader: str, inner: str, unsub_url: str, reason: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:{_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:{_BG};">{_e(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:{_BG};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;font-family:{_FONT};">
<tr><td style="padding:0 0 14px;text-align:center;font-size:20px;font-weight:800;letter-spacing:-.5px;color:{_INK};font-family:{_FONT};">KHEL<span style="color:{_RED};">-O</span></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid {_LINE};border-radius:12px;overflow:hidden;">{inner}</td></tr>
<tr><td style="padding:16px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:{_MUTED};font-family:{_FONT};">{reason} <a href="{_e(unsub_url)}" style="color:{_MUTED};text-decoration:underline;">Unsubscribe in one tap</a>.<br>KHEL-O, Hyderabad, India</td></tr>
</table></td></tr></table></body></html>"""


def _button(url: str, label: str) -> str:
    return (
        f'<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:18px 0 6px;"><tr>'
        f'<td align="center" style="background:#25D366;border-radius:10px;">'
        f'<a href="{_e(url)}" style="display:block;padding:14px 16px;font-family:{_FONT};font-size:16px;font-weight:800;color:#06210F;text-decoration:none;">{_e(label)}</a>'
        f"</td></tr></table>"
    )


def _sign() -> str:
    return (
        f'<p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:{_BODY};font-family:{_FONT};">'
        f'Abdullah<br><span style="color:{_MUTED};font-size:13px;">Founder, KHEL-O</span></p>'
    )


def _p(text: str, extra: str = "") -> str:
    return f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:{_BODY};font-family:{_FONT};{extra}">{text}</p>'


def render(variant: str, first_name: str | None, unsub_url: str, poll_options: list[str] | None = None,
           lead: bool = False) -> Rendered:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    name = _e((first_name or "").strip() or "there")
    reason = "You get this because you asked for KHEL-O updates." if lead else "You get this because you have a KHEL-O account."
    subject, pre = SUBJECTS[variant], PREHEADERS[variant]
    unsub_line = f"{reason} Unsubscribe in one tap: {unsub_url}\nKHEL-O, Hyderabad, India"

    if variant == "a":
        url = community_link("a", "button")
        inner = f"""
<img src="{_front()}/community/email-full-house.jpg" width="560" height="284" alt="Players together at KHEL-O Tekken Challenge #01 at AdamsDen" style="display:block;width:100%;height:auto;border:0;">
<div style="padding:22px;">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:{_RED};font-weight:800;font-family:{_FONT};">Tekken Challenge #01 · AdamsDen</p>
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:{_INK};font-family:{_FONT};">You missed it. Don&rsquo;t miss #02.</h1>
{_p("12 players. 12 matches. 1 champion.", "font-weight:700;color:" + _INK)}
{_p(f"Hi {name}, you are on KHEL-O, but the best nights are announced in our community first. It is free to join and takes one tap.")}
{_button(url, "Join the community")}
{_sign()}
</div>"""
        text = (
            f"Hi {(first_name or '').strip() or 'there'},\n\n"
            "Tekken Challenge #01 at AdamsDen: 12 players, 12 matches, 1 champion. You missed it.\n\n"
            "The best nights are announced in the KHEL-O community first. It is free to join and takes one tap:\n"
            f"{url}\n\nAbdullah\nFounder, KHEL-O\n\n{unsub_line}\n"
        )
        return Rendered(subject, pre, _shell(pre, inner, unsub_url, reason), text)

    if variant == "b":
        vote = community_link("b", "vote", "#vote")
        join = community_link("b", "join")
        opts = poll_options or []
        rows = "".join(
            f'<tr><td style="padding:0 0 8px;"><a href="{_e(vote)}" style="display:block;border:2px solid {_INK};border-radius:10px;padding:12px 14px;'
            f'font-family:{_FONT};font-size:16px;font-weight:800;color:{_INK};text-decoration:none;">{_e(o)}</a></td></tr>'
            for o in opts
        )
        picks = (
            f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0 6px;">{rows}</table>'
            f'{_p("One vote each. You can change it later.", "font-size:13px;color:" + _MUTED)}'
            if opts else _button(vote, "Cast your vote")
        )
        inner = f"""
<div style="padding:22px;">
<p style="margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:{_RED};font-weight:800;font-family:{_FONT};">KHEL-O community</p>
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:{_INK};font-family:{_FONT};">You pick Challenge #02.</h1>
{_p(f"Hi {name}, our first Tekken night had 12 players. For the next one we are letting the community choose the game. Tap yours:")}
{picks}
{_p(f'Want to hear the result first? <a href="{_e(join)}" style="color:{_RED};font-weight:700;">Join the community</a>.', "margin-top:10px")}
{_sign()}
</div>"""
        text_opts = "\n".join(f"- {o}" for o in opts)
        text = (
            f"Hi {(first_name or '').strip() or 'there'},\n\n"
            "Our first Tekken night had 12 players. For Challenge #02 we are letting the community choose the game."
            + (f" The options:\n{text_opts}\n" if opts else "\n")
            + f"\nVote here (one vote each, you can change it later):\n{vote}\n\n"
            f"Want to hear the result first? Join the community: {join}\n\nAbdullah\nFounder, KHEL-O\n\n{unsub_line}\n"
        )
        return Rendered(subject, pre, _shell(pre, inner, unsub_url, reason), text)

    # c: a short plain note. No logo, no image, no button: it should read like a message from a person.
    url = community_link("c", "link")
    plain = f"font-family:{_FONT};font-size:15.5px;line-height:1.6;color:#222;"
    body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#FFFFFF;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#FFFFFF;">{_e(pre)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<div style="max-width:560px;{plain}">
<p style="margin:0 0 14px;">Hi {name},</p>
<p style="margin:0 0 14px;">You signed up on KHEL-O a while back, so I wanted to tell you about something you cannot see in the app.</p>
<p style="margin:0 0 14px;">On 1 Nov we ran a free Tekken challenge at AdamsDen. 12 players showed up and one walked out the champion. The next one, and anything else we run, goes to our WhatsApp community first. It is free and you can leave any time.</p>
<p style="margin:0 0 14px;">You can join here: <a href="{_e(url)}" style="color:{_RED};">{_e(_front())}/community</a></p>
<p style="margin:0 0 14px;">Abdullah<br><span style="color:{_MUTED};font-size:14px;">Founder, KHEL-O</span></p>
<p style="margin:0 0 14px;font-size:14px;color:#555;">P.S. The community is voting right now on which game Challenge #02 should be.</p>
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:{_MUTED};">{reason} <a href="{_e(unsub_url)}" style="color:{_MUTED};">Unsubscribe in one tap</a>. KHEL-O, Hyderabad, India</p>
</div></body></html>"""
    text = (
        f"Hi {(first_name or '').strip() or 'there'},\n\n"
        "You signed up on KHEL-O a while back, so I wanted to tell you about something you cannot see in the app.\n\n"
        "On 1 Nov we ran a free Tekken challenge at AdamsDen. 12 players showed up and one walked out the champion. "
        "The next one, and anything else we run, goes to our WhatsApp community first. It is free and you can leave any time.\n\n"
        f"You can join here: {url}\n\nAbdullah\nFounder, KHEL-O\n\n"
        f"P.S. The community is voting right now on which game Challenge #02 should be.\n\n{unsub_line}\n"
    )
    return Rendered(subject, pre, body, text)
