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
    "a": "{name}, we need to talk about AdamsDen",
    "b": "Pick a side, {name}. Neutral is not an option.",
    "c": "{name}, you're our product manager now (unpaid, sorry)",
}
# Same hooks when we do not know the name (people who only left an email).
SUBJECTS_NO_NAME = {
    "a": "We need to talk about AdamsDen",
    "b": "Pick a side. Neutral is not an option.",
    "c": "You're our product manager now (unpaid, sorry)",
}
PREHEADERS = {
    "a": "Good news, mostly. And a seat with your name on it.",
    "b": "One tap. Most votes wins. No recounts.",
    "c": "Tell us what to build next. We actually read it.",
}

# Candidates for email C. "c" (what gets scheduled) points at one of them; the rest are for tests.
C_CHOICES = {
    "c1": ("{name}, we have a confession", "We have a confession",
           "We're a small team and we're winging some of it. You can help."),
    "c2": ("Roast KHEL-O, {name}. Seriously.", "Roast KHEL-O. Seriously.",
           "Tell us what's annoying. We'll fix what we can."),
    "c3": ("{name}, are we the problem?", "Are we the problem?",
           "Tell us what to fix. We promise not to cry."),
    "c4": ("One question, {name}. Zero wrong answers.", "One question. Zero wrong answers.",
           "Ten seconds. We read every reply."),
    "c5": ("Who's your Tekken rival, {name}?", "Who's your Tekken rival?",
           "Send them this. Settle it at the next challenge."),
    "c6": ("{name}, you've been promoted. No raise.", "You've been promoted. No raise.",
           "Product manager, effective now. Unpaid, sorry."),
}
C_DEFAULT = "c2"
SUBJECTS["c"], SUBJECTS_NO_NAME["c"], PREHEADERS["c"] = C_CHOICES[C_DEFAULT]
TEST_VARIANTS = VARIANTS + tuple(C_CHOICES)

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
    if variant in C_CHOICES:
        with_name, without, _pre = C_CHOICES[variant]
        return with_name.replace("{name}", name) if name else without
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
    if variant not in TEST_VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    name = clean_first_name(first_name) or "there"
    reason = "You get this because you asked for KHEL-O updates." if lead else "You get this because you have a KHEL-O account."
    subject = subject_for(variant, first_name)
    pre = C_CHOICES[variant][2] if variant in C_CHOICES else PREHEADERS[variant]
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
            + ", so I'll skip the introduction.",
            "On 1 Nov we ran our first Tekken challenge at AdamsDen: 12 players, 12 matches, one champion, free to enter. It worked, so there will be more, and we saved you a seat. Okay, it's not a real chair. It's a spot in our WhatsApp community, but it's free, nobody can take it, and you can leave any time.",
            "That's where players pick the game, suggest cafes and nights, and hear about whatever we run first. We're a small team, so your ideas will actually change what we do next.",
            ("Take your imaginary seat", url),
        ]
    elif variant == "b":
        url = community_link("b", "vote", "#vote")
        opts = poll_options or []
        parts = [
            greeting,
            "Challenge #02 needs a game, and we need a tiebreaker. You're it.",
        ]
        if opts:
            parts.append("The options right now: " + ", ".join(opts) + ".")
        parts += [
            "Tap the one you'd play. It takes about 30 seconds, it's one vote each, and you can change it later. The most votes decides what we plan. No recounts.",
            ("Cast your vote", url),
        ]
    else:
        key = C_DEFAULT if variant == "c" else variant
        url = community_link(key, "link")
        reply = "And you can reply to this email any time, it comes straight to us."
        if key == "c1":
            parts = [
                greeting,
                "We have a confession: we're a small team, and we're winging some of it.",
                "The good news is you use KHEL-O, so you see what we miss. Tell us what to add, what to fix, or which cafe we should bring in. We read every suggestion.",
                ("Help us stop winging it", url),
                reply,
            ]
        elif key == "c2":
            parts = [
                greeting,
                "Roast KHEL-O. Seriously. What's annoying, what's missing, what did we get wrong?",
                "We're a small team and we'd rather hear it from you than find out later. We'll fix what we can, and we read every reply.",
                ("Tell us everything", url),
                reply,
            ]
        elif key == "c3":
            parts = [
                greeting,
                "Be honest: are we the problem? If something about KHEL-O annoys you, like booking, prices or a cafe that's missing, we want to hear it.",
                "We promise not to cry. We'll fix what we can.",
                ("Tell us what to fix", url),
                reply,
            ]
        elif key == "c4":
            parts = [
                greeting,
                "One question: what's the one thing you wish KHEL-O did that it doesn't yet? There are zero wrong answers.",
                "Hit reply with a line, or add it on our community page where you can also vote on Challenge #02. It takes ten seconds.",
                ("Add your answer", url),
            ]
        elif key == "c5":
            parts = [
                greeting,
                "Quick one: who's the friend you'd actually beat at Tekken?",
                "Send them this link. Our community is free, it's on WhatsApp, and it's where we announce every challenge first. You can both vote on the game for Challenge #02 while you're there.",
                ("Send it to your rival", url),
                reply,
            ]
        else:
            parts = [
                greeting,
                "Congratulations, you're our product manager now. Effective immediately, and unpaid, sorry.",
                "Your job: tell us what to build next. On our community page you can suggest a game or a cafe, vote on the next challenge, or share a photo from a night out. We read every suggestion.",
                ("Start your first day", url),
                "If a friend would enjoy it too, pass the link on. " + reply,
            ]

    paras = [_link(p[1], p[0]) if isinstance(p, tuple) else _e(p) for p in parts]
    text_parts = [f"{p[0]}: {p[1]}" if isinstance(p, tuple) else p for p in parts]
    text = "\n\n".join(text_parts) + f"\n\n{sign}\n\n{unsub_line}\n"
    return Rendered(subject, pre, _letter(pre, paras, unsub_url, reason), text)
