"""The three community emails (a, b, c), as HTML plus a plain-text copy.

They are written to read like a person typed them, because that is what they are:
a small startup asking its own users for help.
* a real person signs it, one clear link, no shouting, no logo, no image, no button
  (Gmail files styled mail under Promotions, which never notifies);
* every link goes to khel-o.com (no shorteners) and is tagged so the admin Numbers
  tab shows which email brought people in (utm_campaign=community-a / -b / -c);
* a plain-text version travels with the HTML, and the footer says why they got it.
Only things that are true go in: Tekken Challenge #01 had 12 players, 12 matches
and one champion; the community is free and on WhatsApp; the poll is live; people can
vote, suggest a game or café, and send photos on the community page.
"""
import html as _html
from dataclasses import dataclass

from app.config import settings

VARIANTS = ("a", "b", "c")

# What the admin page shows. The real subject comes from subject_for(), which uses the first name.
SUBJECTS = {
    "a": "{name}, a small startup in Hyderabad needs a favour",
    "b": "{name}, you decide our next challenge",
    "c": "{name}, can I ask you something?",
}
# Same hooks when we do not know the name (people who only left an email).
SUBJECTS_NO_NAME = {
    "a": "A small startup in Hyderabad needs a favour",
    "b": "You decide our next challenge",
    "c": "Can I ask you something?",
}
PREHEADERS = {
    "a": "A tiny team, a free community, and a reason to write to you myself.",
    "b": "30 seconds, one tap.",
    "c": "A couple of minutes of your time would mean a lot.",
}

_RED = "#D0463C"
_MUTED = "#63676F"
_FONT = "Arial,Helvetica,sans-serif"


@dataclass
class Rendered:
    subject: str
    preheader: str
    html: str
    text: str


def clean_first_name(full_name: str | None) -> str:
    """First name from the account, tidied: 'uzair' -> 'Uzair', never an email or a number."""
    parts = (full_name or "").strip().split()
    word = parts[0].strip(".,") if parts else ""
    if not word or "@" in word or any(ch.isdigit() for ch in word) or len(word) > 20:
        return ""
    return word.capitalize() if (word.islower() or word.isupper()) else word


def subject_for(variant: str, first_name: str | None) -> str:
    name = clean_first_name(first_name)
    return SUBJECTS[variant].replace("{name}", name) if name else SUBJECTS_NO_NAME[variant]


def _front() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def community_link(variant: str, content: str, anchor: str = "") -> str:
    return (
        f"{_front()}/community?utm_source=email&utm_medium=email"
        f"&utm_campaign=community-{variant}&utm_content={content}{anchor}"
    )


def _e(value: str) -> str:
    return _html.escape(value, quote=True)


def _letter(pre: str, paras: list[str], unsub_url: str, reason: str) -> str:
    """A plain personal letter: no logo, image, box or button. Gmail files styled mail under
    Promotions (and never notifies for it); a letter that reads like a person wrote it stays in Primary.
    `paras` are already-safe HTML."""
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


def _link(url: str, label: str) -> str:
    return f'<a href="{_e(url)}" style="color:{_RED};">{_e(label)}</a>'


def render(variant: str, first_name: str | None, unsub_url: str, poll_options: list[str] | None = None,
           lead: bool = False) -> Rendered:
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    name = clean_first_name(first_name) or "there"
    reason = "You get this because you asked for KHEL-O updates." if lead else "You get this because you have a KHEL-O account."
    subject, pre = subject_for(variant, first_name), PREHEADERS[variant]
    unsub_line = f"{reason} Unsubscribe in one tap: {unsub_url}\nKHEL-O, Hyderabad, India"
    sign = "Abdullah\nFounder, KHEL-O"
    greeting = f"Hi {name},"

    # Each email is a list of paragraphs (plain strings) and, where a link belongs, a
    # (label, url) pair. The same list makes both the HTML and the plain-text copy.
    if variant == "a":
        url = community_link("a", "link")
        parts: list = [
            greeting,
            "I'm Abdullah, one of the founders of KHEL-O. "
            + ("You left your email with us, so" if lead else "You have an account with us, so")
            + " I wanted to write to you myself instead of sending a newsletter.",
            "We're a small startup in Hyderabad. On 1 Nov we ran our first Tekken challenge at AdamsDen: 12 players, 12 matches, one champion, free to enter. It went better than we hoped, and now we want to run more.",
            "Here's the honest part: we can't pick the games, the cafés and the nights on our own. That's what our community is for. It's free, it lives on WhatsApp, you can leave any time, and whatever we run next goes there first.",
            "Would you join us? It would really help.",
            ("Join the community", url),
            "Thank you for being here this early.",
        ]
    elif variant == "b":
        url = community_link("b", "vote", "#vote")
        opts = poll_options or []
        parts = [
            greeting,
            "Quick one, and it takes about 30 seconds. We're planning Challenge #02, and I don't want to guess which game you would actually turn up for.",
        ]
        if opts:
            parts.append("The options right now: " + ", ".join(opts) + ".")
        parts += [
            "Tap the one you'd play. One vote each, and you can change it later.",
            ("Vote here", url),
            "Every single vote helps a tiny team make a better call. Thank you.",
        ]
    else:
        url = community_link("c", "link")
        parts = [
            greeting,
            "Can I ask you for some help? We're a startup, a few of us in Hyderabad, and honestly the best ideas so far haven't come from us. They've come from players.",
            "If you have two minutes, our community page lets you vote on the next challenge, suggest a game or a café we should bring in, or send a photo from a night out. And if you know one friend who'd enjoy this, send them the link too.",
            ("Tell us what you'd like to see", url),
            "No pressure at all. And you can just reply to this email, it comes straight to us.",
        ]

    paras = [_link(p[1], p[0]) if isinstance(p, tuple) else _e(p) for p in parts]
    text_parts = [f"{p[0]}: {p[1]}" if isinstance(p, tuple) else p for p in parts]
    text = "\n\n".join(text_parts) + f"\n\n{sign}\n\n{unsub_line}\n"
    return Rendered(subject, pre, _letter(pre, paras, unsub_url, reason), text)
