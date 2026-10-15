# -*- coding: utf-8 -*-
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("B", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("B-B", "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFont(TTFont("B-I", "C:/Windows/Fonts/ariali.ttf"))
pdfmetrics.registerFont(TTFont("B-BI", "C:/Windows/Fonts/arialbi.ttf"))
pdfmetrics.registerFontFamily("B", normal="B", bold="B-B", italic="B-I", boldItalic="B-BI")

INK = colors.HexColor("#1B1B24"); MUTED = colors.HexColor("#5C5C6B"); BRAND = colors.HexColor("#4B3FD6")
SOFT = colors.HexColor("#EEEDFB"); LINE = colors.HexColor("#D9D9E3"); WARN = colors.HexColor("#FFF3DC")

def st(n, **k):
    b = dict(fontName="B", fontSize=9.2, leading=12.6, textColor=INK); b.update(k); return ParagraphStyle(n, **b)
H1 = st("h1", fontName="B-B", fontSize=18, leading=22, textColor=BRAND, spaceAfter=3)
H2 = st("h2", fontName="B-B", fontSize=11.5, leading=15, spaceBefore=8, spaceAfter=3)
P = st("p", spaceAfter=3); SM = st("sm", fontSize=8, leading=10.8, textColor=MUTED)
C = st("c", fontSize=8.4, leading=11.4); CB = st("cb", fontName="B-B", fontSize=8.2, leading=11, textColor=MUTED)
VO = st("vo", fontName="B-I", fontSize=8.8, leading=12)
BUL = st("bul", leftIndent=11, bulletIndent=1, spaceAfter=1.5)

def esc(t): return re.sub(r"&(?!amp;)", "&amp;", t)
def p(t, s=P): return Paragraph(esc(t), s)
def bl(items): return [Paragraph(esc(i), BUL, bulletText="\u2022") for i in items]
def grid(rows, widths, hdr=True, vo_col=None):
    data = []
    for i, r in enumerate(rows):
        data.append([Paragraph(esc(c), CB if (hdr and i == 0) else (VO if (vo_col is not None and j == vo_col) else C)) for j, c in enumerate(r)])
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if hdr else 0)
    s = [("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
         ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
         ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if hdr: s.append(("BACKGROUND", (0, 0), (-1, 0), SOFT))
    t.setStyle(TableStyle(s)); return t
def box(title, lines, bg=SOFT, edge=BRAND):
    inner = [Paragraph(esc("<b>%s</b>" % title), st("bt", fontSize=9, textColor=edge))] + \
            [Paragraph(esc(l), st("bx", fontSize=8.6, leading=11.8, leftIndent=9, bulletIndent=1), bulletText="\u2022") for l in lines]
    t = Table([[inner]], colWidths=[174 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("BOX", (0, 0), (-1, -1), 0.6, edge),
                           ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t

def foot(c, d):
    c.saveState(); c.setFont("B", 7.6); c.setFillColor(MUTED)
    c.drawString(18 * mm, 9 * mm, "KHEL-O  |  Founder video #1: shoot and edit sheet  |  Draft v1, 2026-10-07")
    c.drawRightString(192 * mm, 9 * mm, "Page %d" % d.page); c.restoreState()

doc = SimpleDocTemplate("E:/KHEL-O/marketing/KHELO_Founder_Video_1_Sheet.pdf", pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                        topMargin=14 * mm, bottomMargin=16 * mm, title="Founder video 1 sheet", author="KHEL-O")
E = []
E.append(p("Founder video #1: shoot and edit sheet", H1))
E.append(p("<b>Vibe:</b> a memory shot on a digicam. Warm, handheld, slightly imperfect, with a calm voice close to the mic over a soft beat. About 25 seconds, vertical 9:16, English with light Hinglish. Posted from @khelo.journey.", P))
E.append(p("<b>Goal:</b> shares (\u201csend this to someone who's about to quit\u201d), then follows. Not bookings. It is a trust video.", P))

E.append(p("The script", H2))
rows = [["Time", "Voiceover (say it like you'd tell one friend)", "On-screen text", "Footage", "Sound"]]
rows += [
    ["0-2s", "Nobody is watching you.", "nobody is watching you", "You or a window, silhouette", "Shutter click on frame 1"],
    ["2-5s", "I spent years scared of what people would think of me.", "scared of what people think", "Walking somewhere quiet", "Soft text tick"],
    ["5-8s", "Then I got to college and noticed nobody cared. It was all in my head.", "it was all in my head", "College corridor or campus (film new)", "Low whoosh (key moment 1)"],
    ["8-12s", "So I started talking to people, even at hackathons, and the right ones showed up.", "so i started talking to people", "Hackathon photos, or you talking to someone", "Soft text tick"],
    ["12-16s", "Now I'm building something of my own, and some days everything breaks at once and I want to quit.", "some days i want to quit", "Laptop at night, your hands", "Low whoosh (key moment 2)"],
    ["16-20s", "But the day you want to quit is the day most people do.", "the day you want to quit is the day most people do", "Close-up of your screen; slow down", "Music dips"],
    ["20-23s", "Don't be average. You only live once, and you'll only be this young once.", "don't be average", "You walking away from camera", "Music swell, then half a second of near silence"],
    ["23-25s", "Send this to someone who's about to quit.", "send this to someone who's about to quit", "Your face to camera, then back to frame 1", "One soft low hit; loop"],
]
E.append(grid(rows, [12, 56, 36, 38, 32], vo_col=1))
E.append(Spacer(1, 3))
E.append(box("Upgrade (optional, only if it is true)", [
    "At 8-12s add one dated fact: \u201cI walked into my first hackathon on [date], scared, and asked the first question.\u201d Fill in the real date and event; do not invent it.",
    "A Hinglish line you'd really say can replace the \u201cscared of what people thought\u201d line (for example the phrase you heard at home). Only use words you actually use.",
], WARN, colors.HexColor("#8A5A00")))

E.append(p("Caption (what shows before \u201cmore\u201d is the hook, 88 characters)", H2))
E.append(Paragraph(esc("nobody is watching you as closely as you think. send this to someone who's about to quit.<br/><br/>"
                       "i was scared of what people thought of me for years. then i started talking to people and things changed. now i'm building something of my own, and the day i want to quit is the day i try hardest not to.<br/><br/>"
                       "#buildinpublic #startupjourney #youngfounder #hyderabad"), st("cap", fontName="B", fontSize=8.8, leading=12.4, leftIndent=6)))
E.append(p("Hashtags: 3 to 5 is enough. I haven't checked their sizes; swap in a more local tag if you find one with under 50k posts. Do not post without the video file attached (Instagram needs media).", SM))
E.append(PageBreak())

E.append(p("Shoot checklist (about 45 minutes)", H2))
E += bl([
    "Digicam clips: 10 to 12, each 3 to 5 seconds, held steady for a count of five. Digicams are horizontal, so keep the subject in the centre; you will crop to vertical.",
    "Light: a window, golden hour or a shaded walk. No harsh overhead light.",
    "Keep it handheld and a little imperfect. Don't over-stabilise.",
    "Shots to get: window or silhouette, walking, college corridor or campus, talking with someone, laptop at night, close-up of hands or screen, you walking away, your face to camera (2 to 3 seconds).",
    "Mix in phone clips for laptop and hands, with a similar warm grade.",
])
E.append(p("Voiceover (15 minutes)", H2))
E += bl([
    "Record on your phone's voice memo, mouth close to the phone, in a quiet room (a wardrobe full of clothes is perfect).",
    "Warm and low, like telling one friend. Not an announcer. Small pauses between lines.",
    "Record every line twice and use the best take. Say it slower than feels normal.",
])
E.append(p("Music and sound", H2))
E += bl([
    "Track: soft, no lyrics, 80 to 95 BPM (lo-fi, indie or ambient with a gentle build). Your reference measured about 85 to 90 BPM, a rough estimate. Do not copy its song.",
    "Keep music about 12 to 15 dB under your voice (in CapCut, lower it wherever you speak).",
    "Source: Instagram's in-app music library or a royalty-free track. A business account has a smaller licensed library, so check what @khelo.journey can use before you edit.",
    "Four sound effects only: camera shutter, soft text tick, two low whooshes at the two key moments, and half a second of near-silence before the last line. People should feel them, not notice them.",
])
E.append(p("Editing in CapCut (60 to 90 minutes)", H2))
E += bl([
    "1. Import the voiceover first. 2. Cut clips to the voice, one shot every 1.5 to 2.5 seconds, slower on the last line. 3. Add music and lower it under you.",
    "4. Add text cards: one font, white, 1 to 6 words, synced to your words, kept in the middle of the frame (not under Instagram's buttons).",
    "5. Add the sound effects. 6. Warm grade, light grain, slight vignette. No heavy filters.",
    "7. Make the last frame match the first so it loops. 8. Watch it with the sound off: the text alone should still make sense.",
    "9. Export 1080 x 1920, 30 fps. Pick a clean cover frame (your face or the hook text).",
])
E.append(p("Posting and measuring", H2))
E += bl([
    "Post around 8:30 PM IST. Stay on Instagram for the first hour and reply to every comment.",
    "Watch these in Instagram Insights: how many stay past 3 seconds, average watch time, and sends per reach. Compare them across your next few videos. I can't promise numbers.",
    "Don't buy views or boost this one. If it works on its own, we can decide later whether to boost.",
])
E.append(Spacer(1, 4))
E.append(box("What the humanizer changed (tells found and fixed)", [
    "Draft was already clean. Three touches: \u201crealised nobody cared\u201d became \u201cnoticed\u201d; two choppy lines merged into one sentence at 12-16s; caption set in lowercase to match how people actually post.",
    "Left alone on purpose: \u201cDon't be average\u201d and \u201cyou only live once\u201d. They're common phrases, but they're your words and your message.",
    "Nothing invented: every fact comes from what you told me. The one gap is the hackathon date.",
]))
doc.build(E, onFirstPage=foot, onLaterPages=foot)
print("ok")
