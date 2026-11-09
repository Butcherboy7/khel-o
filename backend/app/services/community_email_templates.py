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
    "a": "{name}, 12 players showed up. Your controller stayed home.",
    "b": "{name}, settle it: which game gets Challenge #02?",
    "c": "{name}, you're our product manager now (unpaid, sorry)",
}
# Same hooks when we do not know the name (people who only left an email).
SUBJECTS_NO_NAME = {
    "a": "12 players showed up. Your controller stayed home.",
    "b": "Settle it: which game gets Challenge #02?",
    "c": "You're our product manager now (unpaid, sorry)",
}
PREHEADERS = {
    "a": "The next one goes to the community first. Don't miss that one too.",
    "b": "One tap. Most votes wins. No recounts.",
    "c": "Tell us what to build next. We actually read it.",
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
            "Abdullah here from KHEL-O. " + ("You left your email with us" if lead else "You already know the app")
            + ", so here's something you won't see in it.",
            "On 1 Nov we ran our first Tekken challenge at AdamsDen: 12 players, 12 matches, one champion, free to enter. It worked, so there will be more.",
            "We're a small team, so we decided the next ones shouldn't be only our call. Our community is where players pick the game, suggest cafes and nights, and hear about whatever we run first. It's free, it's on WhatsApp, and you can leave any time.",
            "You already know KHEL-O, which is exactly who we want in there. Your ideas will shape what we do next.",
            ("Take your seat", url),
        ]
    elif variant == "b":
        url = community_link("b", "vote", "#vote")
        opts = poll_options or []
        parts = [
            greeting,
            "You know KHEL-O, so you probably have an opinion on this one. For Challenge #02, the community picks the game.",
        ]
        if opts:
            parts.append("The options right now: " + ", ".join(opts) + ".")
        parts += [
            "Tap the one you'd play. It takes about 30 seconds, it's one vote each, and you can change it later. The most votes decides what we plan.",
            ("Cast your vote", url),
        ]
    else:
        url = community_link("c", "link")
        parts = [
            greeting,
            "You use KHEL-O, so you see things we miss. That's why I'd rather ask you than guess.",
            "On our community page you can suggest a game or a cafe we should bring in, vote on the next challenge, or share a photo from a night out. We read every suggestion.",
            ("Tell us what to build next", url),
            "If a friend would enjoy it too, pass the link on. And you can reply to this email any time, it comes straight to us.",
        ]

    paras = [_link(p[1], p[0]) if isinstance(p, tuple) else _e(p) for p in parts]
    text_parts = [f"{p[0]}: {p[1]}" if isinstance(p, tuple) else p for p in parts]
    text = "\n\n".join(text_parts) + f"\n\n{sign}\n\n{unsub_line}\n"
    return Rendered(subject, pre, _letter(pre, paras, unsub_url, reason), text)
