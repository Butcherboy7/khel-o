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

# What the admin page shows. The real subject is subject_for(), which can use the first name.
SUBJECTS = {
    "a": "12 of us played Tekken at AdamsDen. You weren't there.",
    "b": "30 seconds to pick our next challenge",
    "c": "Quick question, {name}",
}
PREHEADERS = {
    "a": "Free to play, 12 players, one champion. The next one is announced to the community first.",
    "b": "Tekken, VALORANT or EA FC? Your vote decides.",
    "c": "It takes one tap to say yes.",
}


def subject_for(variant: str, first_name: str | None) -> str:
    name = (first_name or "").strip()
    if variant == "c" and not name:
        return "Quick question"
    return SUBJECTS[variant].replace("{name}", name)

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


def _letter(pre: str, paras: list[str], unsub_url: str, reason: str) -> str:
    """A plain personal letter: no logo, image, box or button. Gmail files styled mail under
    Promotions (and never notifies for it); a letter that reads like a person wrote it stays in Primary."""
    plain = f"font-family:{_FONT};font-size:15.5px;line-height:1.6;color:#222;"
    body = "".join(f'<p style="margin:0 0 14px;">{p}</p>' for p in paras)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#FFFFFF;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#FFFFFF;">{_e(pre)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<div style="max-width:560px;{plain}">
{body}
<p style="margin:0 0 14px;">Abdullah<br><span style="color:{_MUTED};font-size:14px;">Founder, KHEL-O</span></p>
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:{_MUTED};">{reason} <a href="{_e(unsub_url)}" style="color:{_MUTED};">Unsubscribe in one tap</a>. KHEL-O, Hyderabad, India</p>
</div></body></html>"""


def render(variant: str, first_name: str | None, unsub_url: str, poll_options: list[str] | None = None,
           lead: bool = False) -> Rendered:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    plain_name = (first_name or "").strip() or "there"
    name = _e(plain_name)
    reason = "You get this because you asked for KHEL-O updates." if lead else "You get this because you have a KHEL-O account."
    subject, pre = subject_for(variant, first_name), PREHEADERS[variant]
    unsub_line = f"{reason} Unsubscribe in one tap: {unsub_url}\nKHEL-O, Hyderabad, India"
    link = lambda url, label: f'<a href="{_e(url)}" style="color:{_RED};">{label}</a>'  # noqa: E731

    if variant == "a":
        url = community_link("a", "link")
        paras = [
            f"Hi {name},",
            f'<img src="{_front()}/community/email-full-house.jpg" width="520" height="264" alt="Players at Tekken Challenge #01 at AdamsDen" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:6px;">',
            "On 1 Nov we ran our first free Tekken challenge at AdamsDen. 12 players, 12 matches and one champion. You were not there, and I would like to see you at the next one.",
            "The next one, and anything else we run, goes to our WhatsApp community first. It is free and you can leave any time.",
            f"You can join here: {link(url, _e(_front()) + '/community')}",
        ]
        text = (
            f"Hi {plain_name},\n\n"
            "On 1 Nov we ran our first free Tekken challenge at AdamsDen. 12 players, 12 matches and one champion. "
            "You were not there, and I would like to see you at the next one.\n\n"
            "The next one, and anything else we run, goes to our WhatsApp community first. It is free and you can leave any time.\n\n"
            f"You can join here: {url}\n\nAbdullah\nFounder, KHEL-O\n\n{unsub_line}\n"
        )
        return Rendered(subject, pre, _letter(pre, paras, unsub_url, reason), text)

    if variant == "b":
        vote = community_link("b", "vote", "#vote")
        join = community_link("b", "join")
        opts = poll_options or []
        paras = [
            f"Hi {name},",
            "Our first Tekken night had 12 players. For Challenge #02 we are letting the community choose the game.",
        ]
        if opts:
            paras.append("The options: " + ", ".join(_e(o) for o in opts) + ".")
        paras += [
            f"Vote here, one vote each and you can change it later: {link(vote, _e(_front()) + '/community')}",
            f"Want to hear the result first? {link(join, 'Join the community')}.",
        ]
        text_opts = ("The options: " + ", ".join(opts) + ".\n\n") if opts else ""
        text = (
            f"Hi {plain_name},\n\n"
            "Our first Tekken night had 12 players. For Challenge #02 we are letting the community choose the game.\n\n"
            f"{text_opts}Vote here, one vote each and you can change it later: {vote}\n\n"
            f"Want to hear the result first? Join the community: {join}\n\nAbdullah\nFounder, KHEL-O\n\n{unsub_line}\n"
        )
        return Rendered(subject, pre, _letter(pre, paras, unsub_url, reason), text)

    url = community_link("c", "link")
    paras = [
        f"Hi {name},",
        "You signed up on KHEL-O a while back, so I wanted to tell you about something you cannot see in the app.",
        "On 1 Nov we ran a free Tekken challenge at AdamsDen. 12 players showed up and one walked out the champion. The next one, and anything else we run, goes to our WhatsApp community first. It is free and you can leave any time.",
        f"You can join here: {link(url, _e(_front()) + '/community')}",
    ]
    text = (
        f"Hi {plain_name},\n\n"
        "You signed up on KHEL-O a while back, so I wanted to tell you about something you cannot see in the app.\n\n"
        "On 1 Nov we ran a free Tekken challenge at AdamsDen. 12 players showed up and one walked out the champion. "
        "The next one, and anything else we run, goes to our WhatsApp community first. It is free and you can leave any time.\n\n"
        f"You can join here: {url}\n\nAbdullah\nFounder, KHEL-O\n\n{unsub_line}\n"
    )
    return Rendered(subject, pre, _letter(pre, paras, unsub_url, reason), text)
