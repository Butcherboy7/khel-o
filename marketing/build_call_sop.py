# -*- coding: utf-8 -*-
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether, NextPageTemplate)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("Body", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("Body-B", "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Body-I", "C:/Windows/Fonts/ariali.ttf"))
pdfmetrics.registerFont(TTFont("Body-BI", "C:/Windows/Fonts/arialbi.ttf"))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-B", italic="Body-I", boldItalic="Body-BI")

INK = colors.HexColor("#1B1B24")
MUTED = colors.HexColor("#5C5C6B")
BRAND = colors.HexColor("#4B3FD6")
SOFT = colors.HexColor("#EEEDFB")
GOOD = colors.HexColor("#E6F5EC")
WARN = colors.HexColor("#FFF3DC")
BAD = colors.HexColor("#FDE8E8")
LINE = colors.HexColor("#D9D9E3")

def S(name, **kw):
    base = dict(fontName="Body", fontSize=9.6, leading=13.4, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

H1 = S("H1", fontName="Body-B", fontSize=20, leading=25, textColor=BRAND, spaceBefore=4, spaceAfter=8)
H2 = S("H2", fontName="Body-B", fontSize=13.5, leading=17, textColor=INK, spaceBefore=10, spaceAfter=5)
H3 = S("H3", fontName="Body-B", fontSize=10.8, leading=14, textColor=BRAND, spaceBefore=6, spaceAfter=3)
P = S("P", spaceAfter=4)
SM = S("SM", fontSize=8.4, leading=11.4, textColor=MUTED)
BUL = S("BUL", leftIndent=12, bulletIndent=2, spaceAfter=2)
CELL = S("CELL", fontSize=8.9, leading=12)
CELLB = S("CELLB", fontName="Body-B", fontSize=8.5, leading=11.5, textColor=MUTED)
CARDH = S("CARDH", fontName="Body-B", fontSize=10, leading=13, textColor=colors.white)
SAY = S("SAY", fontName="Body-I", fontSize=9.4, leading=13)

def esc(t):
    return re.sub(r"&(?!amp;)", "&amp;", t)

def p(t, st=P):
    return Paragraph(esc(t), st)

def bullets(items, st=BUL):
    return [Paragraph(esc(i), st, bulletText="\u2022") for i in items]

def box(title, lines, bg=SOFT, edge=BRAND):
    inner = [Paragraph(esc("<b>%s</b>" % title), S("bt", fontSize=9.8, leading=13, textColor=edge))]
    for l in lines:
        inner.append(Paragraph(esc(l), S("bl", fontSize=9.2, leading=12.8, leftIndent=10, bulletIndent=1), bulletText="\u2022"))
    t = Table([[inner]], colWidths=[174 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("BOX", (0, 0), (-1, -1), 0.6, edge),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t

def script(title, lines):
    inner = [Paragraph(esc("<b>%s</b>" % title), S("sb", fontSize=9.4, textColor=BRAND, leading=12))]
    for who, text in lines:
        inner.append(Paragraph(esc("<b>%s</b>  %s" % (who, text)), SAY))
    t = Table([[inner]], colWidths=[174 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F7FB")),
                           ("LINEBEFORE", (0, 0), (0, -1), 2.2, BRAND),
                           ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t

def grid(rows, widths, header=True):
    data = [[Paragraph(esc(c), CELLB if (header and i == 0) else CELL) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if header else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if header:
        st.append(("BACKGROUND", (0, 0), (-1, 0), SOFT))
    t.setStyle(TableStyle(st))
    return t

TAGS = {"D": "Demand", "T": "Trust", "M": "Money", "F": "Fit/Demand", "O": "Operations", "W": "Timing", "A": "Authority", "H": "Hostile/Noise"}

def card(n, said, meaning, comeback, ask, tag, fix):
    head = Paragraph(esc("#%d   \u201c%s\u201d" % (n, said)), CARDH)
    chip = Paragraph(esc("<b>%s</b>" % TAGS[tag]), S("chip", fontSize=8, textColor=colors.white, alignment=2, leading=11))
    rows = [
        [head, chip],
        [Paragraph("They really mean", CELLB), Paragraph(esc(meaning), CELL)],
        [Paragraph("Your comeback", CELLB), Paragraph(esc(comeback), SAY)],
        [Paragraph("Ask next (learn)", CELLB), Paragraph(esc(ask), CELL)],
        [Paragraph("Log + fix", CELLB), Paragraph(esc(fix), CELL)],
    ]
    t = Table(rows, colWidths=[30 * mm, 144 * mm])
    t.setStyle(TableStyle([
        ("SPAN", (0, 0), (0, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("LINEBELOW", (0, 1), (-1, -2), 0.3, LINE),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F2FBF5")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]))
    # header: put objection across the full width, chip at right
    t._argW = [124 * mm, 50 * mm]
    return KeepTogether([t, Spacer(1, 5)])

# Header row needs 2 columns of different width than body rows -> build with nested widths
def card2(n, said, meaning, comeback, ask, tag, fix):
    head = Table([[Paragraph(esc("#%d   \u201c%s\u201d" % (n, said)), CARDH),
                   Paragraph(esc("<b>%s</b>" % TAGS[tag]), S("chip%d" % n, fontSize=8, textColor=colors.white, alignment=2, leading=11))]],
                 colWidths=[134 * mm, 40 * mm])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BRAND), ("LEFTPADDING", (0, 0), (-1, -1), 6),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 4),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    body = Table([
        [Paragraph("They really mean", CELLB), Paragraph(esc(meaning), CELL)],
        [Paragraph("Your comeback", CELLB), Paragraph(esc(comeback), SAY)],
        [Paragraph("Ask next (learn)", CELLB), Paragraph(esc(ask), CELL)],
        [Paragraph("Log + fix", CELLB), Paragraph(esc(fix), CELL)],
    ], colWidths=[30 * mm, 144 * mm])
    body.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                              ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE),
                              ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F2FBF5")),
                              ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                              ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5)]))
    return KeepTogether([head, body, Spacer(1, 6)])

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Body", 7.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "KHEL-O  |  Café owner call SOP  |  Draft v1, 2026-10-07  |  Internal use")
    canvas.drawRightString(192 * mm, 10 * mm, "Page %d" % doc.page)
    canvas.restoreState()

def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BRAND)
    canvas.rect(0, A4[1] - 92 * mm, A4[0], 92 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Body-B", 30)
    canvas.drawString(18 * mm, A4[1] - 40 * mm, "Café Owner Call SOP")
    canvas.setFont("Body", 13)
    canvas.drawString(18 * mm, A4[1] - 52 * mm, "Cold calls, interested owners, and 49 objections with comebacks")
    canvas.setFont("Body", 10)
    canvas.drawString(18 * mm, A4[1] - 66 * mm, "KHEL-O  |  For Uzair and the outreach team  |  Draft v1, 2026-10-07")
    canvas.restoreState()

doc = BaseDocTemplate("E:/KHEL-O/marketing/KHELO_Owner_Call_SOP.pdf", pagesize=A4,
                      leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                      title="KHEL-O Café Owner Call SOP", author="KHEL-O")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="cover", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height - 80 * mm, id="c")], onPage=cover),
                      PageTemplate(id="main", frames=[frame], onPage=footer)])

E = []

# ---------------- COVER ----------------
E += [Spacer(1, 6)]
E.append(p("<b>Read this first (2 minutes)</b>", H2))
E += bullets([
    "<b>Who this is for:</b> café and game-zone owners and managers in Hyderabad. (Players are reached through Instagram and WhatsApp, not calls.) If you also want a player script, say so.",
    "<b>The goal of every call is not a sale.</b> It is one of three outcomes: (1) a meeting or pilot, (2) a clear, honest reason for no that you log, or (3) a referral. Every call must end with something you learned.",
    "<b>\u201c10 out of 10 on every objection\u201d is not possible, and chasing it will make you pushy.</b> What is possible: never be caught without a calm response, never lie, and turn every no into data. This SOP is built for that.",
    "<b>Honesty rule:</b> every comeback here is true as of 2026-10-07. Do not add claims about users, bookings or income that are not in your admin. Owners talk to each other; one lie costs you the whole area.",
    "<b>About Saad Sells:</b> I could not find his own material online, so I did not copy or guess his scripts. This SOP uses widely taught methods (permission opener, acknowledge-then-ask, discovery questions). If you paste notes from his videos, I will merge his ideas in. Sources are at the end.",
])
E.append(Spacer(1, 4))
E.append(box("What you can truthfully say today", [
    "KHEL-O is a booking app for gaming cafés and game zones: players see live availability, pick a slot and pay online; the café scans a QR code at the desk.",
    "Free for cafés: no setup fee and no monthly fee. The player pays a small platform fee on top of your price. Your payout goes to your UPI ID weekly.",
    "You control it: which stations are app-bookable vs walk-in only, your prices and hours, offers only for the hours you choose (for example weekday daytime), pause bookings any time, staff logins.",
    "Two real cafés are live in Hyderabad (DG Gaming Cafe and Rockstar Gaming Cafe). A number of cafés are listed as \u201cBooking Soon\u201d and players can vote for them.",
], GOOD, colors.HexColor("#1F7A45")))
E.append(Spacer(1, 6))
E.append(box("What you must NOT say today (it is not true yet)", [
    "Any number of players, bookings or income you cannot show in your admin. Real paid bookings so far: effectively none. Real sign-ups: about 98.",
    "\u201cWe will bring you X customers.\u201d You cannot promise it. Say what you will do, not what will happen.",
    "That a WhatsApp alert to the café exists. Today it is in-app and web push only; WhatsApp is not built.",
    "That the café fee is permanent. A future café-side fee is a plan, not a promise (see objection #14 for how to answer).",
], BAD, colors.HexColor("#B3261E")))
E.append(NextPageTemplate("main"))
E.append(PageBreak())

# ---------------- ONE PAGE CHEAT SHEET ----------------
E.append(p("1. The one-page call flow (print this)", H1))
E.append(grid([
    ["Step", "What you do", "Time", "Output"],
    ["0. Prep", "Open the café's Google Maps and Instagram. Note stations, busy times, rating, anything specific. Call at their quiet hours (see §2).", "1 min", "One personal line"],
    ["1. Opener", "Name, why you are calling in one sentence, ask permission for 30 seconds.", "10 s", "Permission"],
    ["2. Hook", "One sentence about THEIR problem (empty weekday seats), not about KHEL-O.", "10 s", "Interest or a no"],
    ["3. Discover", "Ask 3 to 5 questions. Let them talk. Write it down.", "2 to 4 min", "Their real situation"],
    ["4. Offer", "Two sentences, then the ask: a 15-minute meeting or a 2-week free pilot. No big pitch.", "30 s", "Yes / not yet / no"],
    ["5. Handle", "Acknowledge, ask, answer, advance. One objection at a time (see §5).", "1 to 3 min", "The real reason"],
    ["6. Close", "Lock a time, or a clean exit with permission to follow up. Read it back.", "20 s", "Next step"],
    ["7. Log", "Within 2 minutes: result, reason code, quote, next date (see §6).", "2 min", "Data"],
], [20, 98, 20, 36]))
E.append(Spacer(1, 6))
E.append(box("Seven rules of the call", [
    "Be human. Smile when you speak, speak slower than feels natural.",
    "Never argue. If they push, agree first, then ask.",
    "One question at a time. Then be quiet. The silence is where the answer comes.",
    "Never lie, never guess a number. \u201cI will check and message you\u201d is a good answer.",
    "A no is information. Always ask one gentle follow-up before you hang up.",
    "Never call the same number again after \u201cdo not call.\u201d Respect it and log it.",
    "Ten calls a day is enough. Quality of the log beats the number of dials.",
]))
E.append(PageBreak())

# ---------------- PREP ----------------
E.append(p("2. Before you call", H1))
E.append(p("<b>When to call:</b> You told me owners say their seats are empty during college and office hours. Those are also the hours they are free to talk. Try <b>weekdays 11:00 to 16:00</b>. Avoid Friday to Sunday evenings, when a good café is busy and you will sound like a nuisance.", P))
E.append(p("<b>Where the list comes from:</b> start with the Hyderabad cafés that already have player votes (your admin Leads / Demand page), then the rest. A café with votes is the strongest opening you have; say the number honestly.", P))
E.append(p("<b>One-minute prep for each café:</b>", H3))
E += bullets([
    "Google Maps: rating, number of reviews, \u201cpopular times\u201d chart (where is it quiet?).",
    "Their Instagram: do they post offers? Followers? Tournaments? Who runs the page?",
    "How many stations and what kind (PS5, PC, snooker, VR)? Is it a chain or one owner?",
    "Write ONE personal line: \u201cI saw your PS5 setup on Instagram\u201d or \u201cI saw weekday afternoons look quiet on Google.\u201d",
    "Who answers: owner, manager, or staff? If staff, your goal changes to \u201cget the owner's best time and number.\u201d",
])
E.append(Spacer(1, 4))
E.append(box("Your fields before you dial (copy to a sheet)", [
    "Café, area, pincode, chain or single, owner/manager name, number, source (vote count, Instagram, referral).",
    "Call date and time, result code, reason code, quote in their own words, next step and date.",
]))
E.append(PageBreak())

# ---------------- COLD CALL SOP ----------------
E.append(p("3. Cold call SOP: step by step with words you can use", H1))
E.append(p("Say it in your own voice. The scripts are a safety net, not a recording. Hinglish first, English if they answer in English.", SM))

E.append(p("Step 1: The opener (10 seconds)", H2))
E.append(script("Opener (Hinglish)", [
    ("You:", "Hi sir, main Uzair bol raha hoon, Hyderabad se, KHEL-O, gaming café booking app. Main seedha aapko disturb karke call kar raha hoon. 30 second de sakte hain? Relevant nahi laga toh bol dena, main call kaat dunga."),
]))
E.append(Spacer(1, 3))
E.append(script("Opener (English)", [
    ("You:", "Hi, this is Uzair from KHEL-O, a gaming café booking startup in Hyderabad. I know I'm calling out of the blue. Do you have 30 seconds? If it's not relevant, tell me and I'll let you go."),
]))
E.append(p("<b>Why it works:</b> you admit the interruption, you ask for a small yes, and you give them an easy way out. People relax when they feel in control.", SM))
E.append(p("<b>If the answer is \u201cwho is this?\u201d or \u201cwhat is it?\u201d</b>, skip to Step 2 immediately. <b>If it is \u201cnot interested\u201d,</b> go to objection #1 (do not pitch).", SM))

E.append(p("Step 2: The hook, about their problem (10 seconds)", H2))
E.append(script("Hook", [
    ("You:", "Maine kai café owners se baat ki hai, aur kaafi owners ne yahi bataya: weekday ko college aur office hours mein seats khaali rehti hain. Aapke yahan bhi aisa hota hai, ya aap alag ho?"),
]))
E.append(p("Why a question and not a claim: you learn immediately whether the problem is real for this café. If they say \u201cwe are always full,\u201d you have learned something and you switch to the \u201cfull café\u201d path (objection #20). Only say \u201cI spoke to owners\u201d if it is true; it is (you told me about 150).", SM))

E.append(p("Step 3: Discovery (2 to 4 minutes): learn everything", H2))
E.append(p("Pick 3 to 5 questions that fit the flow. Do not read the list like a form. After each answer, say \u201cgot it\u201d and ask a follow-up about the last thing they said.", P))
E.append(grid([
    ["Topic", "Questions"],
    ["Business", "How many stations do you have, and what types? Single café or more branches? How long have you been running it?"],
    ["Demand", "Which days and hours are full? Which are empty? Roughly what share of your seats sits empty on a weekday afternoon? What does a bad day cost you?"],
    ["How bookings work now", "How do people reserve today: call, WhatsApp, Instagram DM, walk-in? Who handles it? How many calls or DMs a day? Do you ever turn people away or lose them?"],
    ["Customers", "Who are your regulars: college, office, school kids? How far do they travel? Do they pay UPI or cash?"],
    ["Past attempts", "Have you tried anything to fill empty hours: offers, Instagram ads, tournaments, other apps? What happened?"],
    ["Money", "What is your price per hour? Do you give discounts? Do you currently pay anyone to bring customers?"],
    ["Decision", "Is it just you who decides on something like this, or someone else too?"],
    ["Magic wand", "If I could fix one thing about your bookings or your quiet hours this month, what would it be?"],
], [32, 142]))
E.append(Spacer(1, 4))
E.append(box("Discovery rules", [
    "Listen for the number. \u201cHalf the seats\u201d, \u201cten calls a day\u201d, \u201cfour hours empty\u201d: write the exact words.",
    "If they complain about something we do not solve (rent, electricity, staff), say \u201cthat's hard\u201d and move on; do not promise to fix it.",
    "If they show interest in the answer to the magic-wand question, repeat it back in their words before you pitch. That is your pitch.",
]))

E.append(p("Step 4: The two-sentence offer, then the ask", H2))
E.append(script("Offer + ask (honest version)", [
    ("You:", "Toh KHEL-O ek booking app hai jahan players aapki live availability dekh ke slot book karte hain. Aapke liye free hai, koi setup ya monthly fee nahi, aur aap sirf unhi hours ke liye offer laga sakte hain jab seats khaali rehti hain, jaise weekday afternoon."),
    ("You:", "Main aapse promise nahi karunga ki 100 customers aayenge. Hum abhi chhote hain. Isliye main sirf 2 hafte ka free pilot maang raha hoon, koi risk nahi, jab chahein band kar sakte hain. Kal ya parso 15 minute mil sakte hain, main aapke café aa jaoon?"),
]))
E.append(p("<b>The ask is small on purpose:</b> 15 minutes, in person if possible. People say yes to small, specific asks. Never ask them to \u201csign up\u201d on the phone call.", SM))

E.append(p("Step 5: Handle what comes (see Section 5)", H2))
E.append(p("Use the loop: <b>Acknowledge, Ask, Answer, Advance.</b> You must have an Ask in every response; that is how a rejection becomes information.", P))

E.append(p("Step 6: Close the call", H2))
E.append(grid([
    ["Outcome", "What to say"],
    ["Yes to meeting", "Great. Tomorrow 12:30, your café. I'll message the details on WhatsApp now. Who should I ask for when I arrive?"],
    ["Maybe", "No problem. What would you need to see to decide? Can I message you the one-page info and call you on Thursday at 12?"],
    ["No, with a reason", "Thanks for being straight with me. Last question, so I learn: what's the main reason? (Then log it.) If things change, may I check back in a month?"],
    ["No, hostile", "Understood, sorry for the disturbance. Take care. (Log, do not call again.)"],
], [36, 138]))
E.append(PageBreak())

# ---------------- WARM / INTERESTED SOP ----------------
E.append(p("4. SOP for owners who are already interested", H1))
E.append(p("An interested owner is not a customer yet. The risk now is a polite yes that goes quiet. This SOP moves them from interest to a live café with small, clear steps and learns more at each stage.", P))
E.append(grid([
    ["Stage", "What you do", "Output", "Done when"],
    ["W1  Same day", "Send the WhatsApp message (template in §7) with the time and place. Thank them. Save their number with the café name.", "Meeting booked", "They reply \u201cok\u201d"],
    ["W2  Discovery meeting (20 min, in person)", "Ask the deeper question list below. Look at their desk and their phone: how do they take bookings today? Take two photos with permission.", "Real picture of their café", "You know their empty hours, price, stations, who decides"],
    ["W3  Design the pilot together", "Choose 1 to 2 stations to make app-bookable (start small). Choose one offer for their quiet hours only. Set minimum length. Keep walk-in seats for the rest.", "Pilot written on one page", "They agree out loud"],
    ["W4  Onboard", "Collect: café details and location, opening hours, stations and prices, 5 to 8 photos, UPI ID for payouts, staff phone. Set it up with them on your phone.", "Café live or ready for review", "Profile submitted"],
    ["W5  Test booking together", "Make a small test booking with them. Show the QR scan, the dashboard, pause button and staff login. Ask the staff to scan once.", "They have seen it work", "Staff can check in unaided"],
    ["W6  Week-1 check-in", "Visit or call on day 3 and day 7. Ask: any bookings, any confusion, any complaints? Share the numbers you actually see.", "First real feedback", "Written in the log"],
    ["W7  Day-14 review", "Show numbers. Ask: continue, change, or stop? Ask for an intro to one other owner and for permission to use their name and a photo.", "Decision + referral", "They answer all three"],
], [30, 78, 34, 32]))
E.append(Spacer(1, 6))
E.append(p("Deeper questions for the discovery meeting", H2))
E += bullets([
    "Walk me through last Tuesday afternoon. How many seats were empty, and for how long?",
    "Who are your five best customers? What brings them back?",
    "When someone calls to ask if a seat is free, what happens? How many calls do you miss?",
    "What is the biggest headache in running the café day to day?",
    "What would make you say \u201cthis app is a waste\u201d after a week? (This tells you your risk.)",
    "What would make you say \u201cthis is great\u201d? (This tells you your promise.)",
    "Who else should I speak to: partner, manager, cashier?",
    "Do you know other café owners who face the same problem?",
    "Is there anything about KHEL-O (website, process, name) that makes you hesitate? Be blunt.",
])
E.append(Spacer(1, 4))
E.append(box("Pilot rules to agree upfront (write them down)", [
    "Length: 14 days, then a review. Either side can stop at any time.",
    "Scope: 1 to 2 stations, quiet hours only, one offer. Everything else stays walk-in.",
    "Success: agreed together before it starts, for example \u201c10 bookings in 14 days in those hours.\u201d Do not promise it will happen.",
    "Fees: [CONFIRM BEFORE USING] state clearly what the café pays today (nothing) and what the player pays (platform fee on top).",
    "You will message on day 3, day 7 and day 14. They will tell you honestly what is not working.",
], WARN, colors.HexColor("#8A5A00")))
E.append(Spacer(1, 4))
E.append(p("When an interested owner goes quiet", H2))
E.append(grid([
    ["When", "Message (WhatsApp, short, human)"],
    ["Day 1 after no reply", "Hi sir, quick one: shall I come Thursday 12:30 or Friday 12:30? Whichever works."],
    ["Day 3", "No pressure at all. I made a 1-page summary of what we discussed. Want me to send it?"],
    ["Day 7", "Sir, one honest question: did something about KHEL-O make you hesitate? Your answer helps me fix it, even if it's a no."],
    ["Day 14 (breakup)", "I'll stop messaging so I don't disturb you. If quiet weekday hours ever hurt, you have my number. Thanks for your time."],
], [34, 140]))
E.append(PageBreak())

# ---------------- OBJECTIONS ----------------
E.append(p("5. The method for every objection", H1))
E.append(p("Four steps, same order, every time:", P))
E += bullets([
    "<b>Acknowledge</b> (\u201cThat's fair\u201d, \u201cI get it\u201d): never defend, never argue.",
    "<b>Ask</b> a question that finds the real reason. The first objection is usually a reflex; the second one is the truth.",
    "<b>Answer</b> briefly and honestly, using only things in the \u201cwhat you can truthfully say\u201d box.",
    "<b>Advance</b>: a small next step (a question, a 15-minute meeting, a WhatsApp message) or a clean, friendly exit.",
])
E.append(p("Each card below shows what they say, what they probably mean, a comeback that you can say, the question to learn more, and what to log and fix. Reason codes: <b>T</b> trust, <b>M</b> money, <b>F</b> fit/demand, <b>O</b> operations, <b>W</b> timing, <b>A</b> authority, <b>H</b> hostile/noise.", SM))
E.append(Spacer(1, 4))

N = [0]
def C(said, meaning, comeback, ask, tag, fix):
    N[0] += 1
    return card2(N[0], said, meaning, comeback, ask, tag, fix)

def section(title):
    return p(title, H2)

# 5A BRUSH-OFFS
E.append(section("A. Brush-offs (the first 10 seconds)"))
E.append(C("Not interested.",
           "You interrupted me and have not yet earned my attention. It is usually a reflex, not a decision.",
           "That's fair, sir, you don't know what it is yet. Can I ask just one question before I go? Do your seats sit empty on weekday afternoons, or are you full all day?",
           "Is it that you don't want this kind of thing at all, or just not right now?",
           "W", "Log: \u201creflex\u201d or \u201creal no\u201d. If a real no, log the stated reason and ask permission to check back in a month. If 50% of calls end here, your opener is the problem; shorten it."))
E.append(C("I'm busy right now.",
           "Bad timing, or a polite no.",
           "Of course, sir, I'll keep it short. When is a better 2 minutes today or tomorrow: after 4 or before lunch?",
           "Is the quiet time of the day around 12 to 4?",
           "W", "Log the better time. If you never get a callback, they are likely never free: switch to visiting the café."))
E.append(C("Send me the details on WhatsApp.",
           "Getting rid of you, or genuinely wants to look at it. Both happen.",
           "Sure, happy to. So I send you the right thing and not a long message: what's the one thing you'd want to know first? Also, can I call you tomorrow at 12 to check it reached you?",
           "Which matters more to you: more bookings in quiet hours, or less phone-call load?",
           "W", "Log what they said they want to know first; that is your hook next time. Only send the 3-line message from §7."))
E.append(C("Call me later / next week.",
           "Not now, maybe never.",
           "Absolutely. To make that call useful, what would be the one thing you'd want to see by then? And which day and time should I try, so I don't catch you in a busy hour?",
           "Is it a timing thing, or do you need to think about whether this is for you?",
           "W", "Log the callback date and what they want to see. Call exactly then and say \u201cyou asked me to call\u201d."))
E.append(C("Who gave you my number?",
           "Annoyed, protective, or suspicious.",
           "Fair question. Your café is listed publicly on Google Maps and Instagram, and that's where I found the number. I called only because quiet hours are a problem I'm trying to solve for cafés. If you'd prefer I don't call again, I'll remove you right now.",
           "Would a message be better than a call?",
           "H", "Never say it came from a person unless it did. If they say stop, log \u201cdo not call\u201d immediately."))

# 5B TRUST
E.append(section("B. Trust and credibility"))
E.append(C("Who are you? I've never heard of KHEL-O.",
           "You are unknown, and I carry the risk if it goes wrong.",
           "You're right, sir, we're new and we're a small team in Hyderabad. DG Gaming Cafe and Rockstar Gaming Cafe are live with us. That's why I'm not asking for a contract, only a two-week free pilot so you can judge us by what happens in your café.",
           "What would make you comfortable trying something new like this?",
           "T", "Log what would build trust (reference, photo, meeting, owner-to-owner call). This is your trust fix list."))
E.append(C("How many players do you have?",
           "Testing whether you're real and whether the audience is real.",
           "Honest answer: we're early. About 100 players have signed up, and we haven't had many paid bookings yet. I won't pretend otherwise. What I can promise is that in the pilot I'll show you every number, good or bad, and we stop if it's not working.",
           "How many bookings would you need in a month for this to be worth your time?",
           "T", "Log their threshold number. That is the target you must hit to win owners. Confirm your admin numbers before each call so you never overstate."))
E.append(C("Show me a café already using it.",
           "Reduces risk by copying someone else.",
           "Sure. DG Gaming Cafe is live, and Rockstar Gaming Cafe too. I can show you their listing right now, and if they're okay with it, introduce you. [Only offer an introduction after you've asked the owners.]",
           "Is it more the booking part or the payment part you'd want to check?",
           "T", "Log the request. Ask your two live cafés for permission to be references; make it a standing item."))
E.append(C("Is this a scam? Are you taking my money?",
           "Fear. Many small owners have been burned by apps.",
           "I understand the worry. Nothing from you: listing is free, there's no card, no deposit. Players pay through Razorpay, and your share goes to your UPI ID every week. You can see every booking in your dashboard and switch it off any time.",
           "What happened before that makes you careful? (Listen.)",
           "T", "Log the past bad experience. Often it is a competitor's practice; avoid it in your offer."))
E.append(C("You're too young / a startup, you'll shut down.",
           "Worried about relying on something that may vanish.",
           "Fair concern. That's why the pilot is small: if we disappear, you've lost nothing, your café still works exactly as before, and your walk-ins are untouched.",
           "What do you worry about most if an app stops working?",
           "T", "Log. Make sure the pilot has no lock-in and that you say it out loud."))
E.append(C("Why would customers trust your app?",
           "Doubts that players will pay online to an unknown name.",
           "Good question. Payment is via Razorpay, they get a QR pass, and they see your photos, price and reviews before they pay. And the QR scan at your desk means you check every booking yourself.",
           "Do your customers already pay by UPI at your counter?",
           "T", "Log. If many say \u201ctheir customers don't trust online payment\u201d, consider pay-at-café as a product option."))
E.append(C("It's not on the Play Store / App Store.",
           "Expects a real app; a website feels less serious.",
           "Right, it's a web app today. Players tap Add to Home Screen and it works like an app. A store app is something we'd build when it makes sense. For you, nothing to install: you manage it from a browser.",
           "Do you use a phone or a computer at your desk?",
           "T", "Log. If this appears often, test an Add-to-Home-Screen guide and a store listing later."))

# 5C MONEY
E.append(section("C. Money"))
E.append(C("What do you charge?",
           "The real first question. Wants to know the cost before committing.",
           "For you, nothing: no setup fee and no monthly fee. The player pays a small platform fee on top of your price, so your price stays your price.",
           "Do you pay anyone today to get customers, like ads or other apps?",
           "M", "Log what they pay today; it sets what they might pay later. [CONFIRM BEFORE USING: exact player fee wording in current settings]"))
E.append(C("Free means you'll charge me later.",
           "Smart suspicion.",
           "Fair. Today it's free. If we ever add a fee for cafés, it would only be on bookings we actually bring you, and you'd hear it from me first, before it applies. [CONFIRM: only say this if you are sure you will keep that promise.]",
           "What would feel fair to you: a small share per booking, or something else?",
           "M", "Log their fair-price idea. It will test your later 8% plan; collect at least 10 answers before fixing the price."))
E.append(C("I don't pay for anything that hasn't brought me customers.",
           "Wants pay-for-results, no upfront risk.",
           "That's exactly how it works today: you pay nothing now. If we bring you bookings you wouldn't have had, that's where we both win.",
           "What does a new customer in a quiet hour mean to you in rupees?",
           "M", "Log their value per booking. Use it to explain the worth of a later fee."))
E.append(C("8% is too high. (If a fee is mentioned.)",
           "Compares your cut with their thin margin.",
           "It's good to hear that, sir. Think of it as 8 only on the bookings we bring, and zero on your walk-ins and regulars. The question is whether those extra bookings are worth it to you. What would feel fair?",
           "What is your margin on an hour of play, roughly?",
           "M", "Log the maximum percentage they would accept. Do not defend 8%; collect data until you have 10 owners' numbers."))
E.append(C("Who pays the payment gateway fee?",
           "Hidden-cost worry.",
           "The player does. It's part of the platform fee they pay on top. [CONFIRM current fee model before saying it.]",
           "Do you pay gateway or UPI charges anywhere today?",
           "M", "Log. If cafés expect zero fees on refunds or failed payments, decide your policy."))
E.append(C("When do I get my money? A week is too long.",
           "Cash flow worries, especially for small owners.",
           "Payouts go to your UPI weekly. Everything you earn is visible in the dashboard, and you can see exactly which bookings each payout covers. If the weekly rhythm doesn't work for you, tell me and I'll note it.",
           "How long do you normally wait for cash from other sources?",
           "M", "Log. If this is common, consider shorter payout cycles for owners with consistent volume."))
E.append(C("GST / taxes / paperwork. I don't want trouble.",
           "Avoids anything that may create paperwork.",
           "Understood. PAN and GST details are optional to start, and we only need a UPI ID for payouts. If your CA needs anything on paper, I'll send what you need. [CONFIRM tax and TDS treatment with your CA before promising.]",
           "Are you GST-registered today?",
           "M", "Log. If it blocks many owners, ask your accountant for a one-page answer."))

# 5D FIT
E.append(section("D. Fit and demand"))
E.append(C("We're already full.",
           "Believes there's no problem to solve, or is rejecting politely.",
           "That's great to hear, sir. Which days and hours are full, and when does it get quieter? Most owners say weekdays 11 to 4 are the hard ones.",
           "If a customer arrives and you're full, what happens to them: queue, leave, call back?",
           "F", "Log the exact quiet hours. If truly full all week, offer to come back in the exam or holiday season and log \u201cfull\u201d. This is rare in what you've heard (about 5 in 150)."))
E.append(C("We're empty, so who will come through your app?",
           "The sharpest objection. They want to know where the customers come from.",
           "Honest answer: nobody will come until players find us. Right now I'm building that audience in Hyderabad, and cafés with votes from real players come first. I can't promise numbers. What I can offer is a free two-week pilot so you see what happens.",
           "If 10 more players found you in quiet hours, what would that mean for you?",
           "D", "This is your core business problem. Count how often it comes up; if more than 30%, do not call more cafés until your player side has more proof."))
E.append(C("My customers are regulars and walk-ins. They don't use apps.",
           "Thinks online booking is irrelevant.",
           "Totally, and that's the beauty: nothing changes for your regulars. The app is only for new people who find you, and for the seats you choose to open for them.",
           "How do new customers find you today?",
           "F", "Log how they get new customers (Instagram, word of mouth, Google). That is where your competitor is."))
E.append(C("My customers are school kids and pay cash.",
           "Age and payment doubts.",
           "That's true for some cafés. Many players today have UPI through a parent or a friend. You can keep cash for walk-ins. The app is only an extra door.",
           "What share of your customers pay by UPI today?",
           "F", "Log the UPI share. If very low, product fit is weaker for that café type; note it."))
E.append(C("I already have Instagram and WhatsApp, it works fine.",
           "Status quo bias.",
           "That's great, sir, and you should keep them. Most owners still lose the \u201cis a seat free right now?\u201d question. Our app answers it live, so nobody needs to call or DM.",
           "How many such calls or DMs do you get a day, and how many do you miss?",
           "F", "Log the number of calls/DMs and misses. If it's near zero, the value of live booking is low for them."))
E.append(C("Why not Playo or District? Or Google Maps?",
           "Compares you with bigger names.",
           "Good question. Those are broader platforms. We're built only for gaming cafés and game zones, with live availability by station and offers for your quiet hours. You can be on all of them; they don't conflict.",
           "Are you on any of them? How is it working?",
           "F", "Log what they like or dislike about competitors. That is your positioning."))
E.append(C("Why do I need online booking? People just come.",
           "Doesn't feel the problem.",
           "If people just come and you're always comfortable, you may not need it. If some days you're packed and other days empty, an app helps you fill the empty ones. Which is it for you?",
           "What does a really empty Tuesday look like?",
           "F", "Log. Add to the count of \u201cno need\u201d; if it's the top reason, change your target café type."))

# 5E OPERATIONS
E.append(section("E. Operations and control"))
E.append(C("What if someone books online and a walk-in takes that seat?",
           "Worried about double-booking and angry customers.",
           "You decide how many seats are bookable online. Start with just one or two. The rest stay walk-in. You can also pause online bookings in one tap any time.",
           "How do you handle it when two groups want the same console today?",
           "O", "Log their process. Check the walk-in vs app split is easy for them to understand; fix wording if not."))
E.append(C("My staff can't handle apps. I'm not tech-savvy.",
           "Fear of complexity and being embarrassed.",
           "Totally fine. Staff only do one thing: scan the player's QR code when they arrive. I'll sit with you and your staff and set it up on day one.",
           "Who works the desk, and are they comfortable with a phone?",
           "O", "Log. If often, build a 60-second video for staff (your tutorial plan) and a simple card."))
E.append(C("No-shows: who pays?",
           "Wants protection from empty seats.",
           "Good question. The booking is paid online in advance, so a no-show is already paid for. [CONFIRM what happens to a no-show payout before you say this.]",
           "How many no-shows do you get on a normal weekend?",
           "O", "Log. Make sure your no-show policy is clear in the pilot sheet."))
E.append(C("Cancellations and refunds will be a mess.",
           "Past bad experience with refunds.",
           "Players can cancel up to 2 hours before the session and get a refund through the payment system; after that, no cancellation. You don't have to hand money back yourself. [CONFIRM how the platform fee and your payout are treated on a refund.]",
           "How do you handle cancellations today?",
           "O", "Log. If owners want a different cancellation window, note it for a setting later."))
E.append(C("I don't want to give discounts. You'll make me cut prices.",
           "Fear of eroding margin.",
           "You decide. Offers are optional, and you can limit them to quiet hours, for example weekday afternoons. Your normal price stays the same for everyone else.",
           "In quiet hours, is a lower price better than an empty seat?",
           "M", "Log their lowest acceptable price in quiet hours. That sets your offer defaults."))
E.append(C("My setups and prices are too complicated.",
           "Fear of effort.",
           "I'll do the setup with you on my phone, in about 20 minutes: stations, prices, hours, photos. We start with just one or two stations.",
           "How many types of stations and price bands do you have?",
           "O", "Log. Complex pricing may point to a feature gap; note exactly which price rule they need."))
E.append(C("I don't want competitors to see my prices.",
           "Privacy and price wars.",
           "Prices are shown to players, like on any listing. If you'd rather start with one setup or only offers for quiet hours, we can.",
           "Do your prices already appear on your Instagram or Google?",
           "O", "Log. Usually prices are already public."))
E.append(C("I don't have time to set it up.",
           "Real constraint, or a polite no.",
           "Fair, you won't need to. I come to your café at your quiet hour, we do it together in 20 minutes, and you don't touch it again unless you want to.",
           "What time of day is calmest for you?",
           "O", "Log the best setup slot. If many say this, offer onboarding by video call."))

# 5F RISK
E.append(section("F. Risk and control"))
E.append(C("What if I want to leave? Is there a contract?",
           "Fear of lock-in.",
           "No contract and no lock-in. You can pause bookings or leave any time, and your café continues as before.",
           "What kind of agreement have you had with other platforms?",
           "T", "Log. Make sure no pilot terms conflict with this."))
E.append(C("What if nobody books?",
           "Fear of wasting effort.",
           "Then you've lost 20 minutes of setup, and nothing else. That's why the pilot is two weeks and starts small. If nobody books, I'll tell you why honestly, and we stop.",
           "How many bookings would make it worth keeping?",
           "D", "Log their number. Set up the pilot success measure on it."))
E.append(C("You'll take my customers or my data.",
           "Worried the platform will own the relationship.",
           "Your customers remain yours. Players book your café by name and come to your desk. We don't sell your data, and you can see exactly what we hold. [CONFIRM current data policy wording before saying this.]",
           "What would you want to keep control of?",
           "T", "Log. Check privacy and owner terms read clearly."))
E.append(C("I don't want customers who only come for discounts.",
           "Wants loyal, full-price customers.",
           "Agreed. Make the offer small and limited to quiet hours only, and focus on a first visit. Regulars still pay full price.",
           "What kind of customers do you want more of?",
           "F", "Log the target customer. Use it for your offer design."))

# 5G AUTHORITY
E.append(section("G. Authority and decisions"))
E.append(C("The owner isn't here / head office decides.",
           "You're not talking to the decider.",
           "Understood. Would it help if I send a short message you can forward, and I call the owner myself at a time that suits them? What's the best time and the right name?",
           "Who exactly decides on something like this?",
           "A", "Log the decider's name and best time. If it's a chain HQ, switch to the chain approach in #43."))
E.append(C("I need to think about it.",
           "I'm not convinced, or I don't know how to say no.",
           "Of course. To make it easy to think, what's the one thing you're still unsure about? I'd rather fix it than have you guess.",
           "Is it more about trust, money, or the effort of setting up?",
           "W", "This is your most important question; the answer tells you what to fix. Log the reason code."))
E.append(C("Talk to my manager / partner.",
           "Doesn't want to decide alone.",
           "Sure. Can we do a 15-minute meeting with both of you so I answer questions once, instead of through you? What time works?",
           "What will they ask first?",
           "A", "Log their likely questions and prepare for them."))

# 5H CHAINS
E.append(section("H. Chains and bigger cafés"))
E.append(C("We have our own booking system or app.",
           "Don't need you.",
           "That's great, and a sign you take bookings seriously. Our difference is that players discover you through us, not only the ones who already know you. Is discovery of new customers a goal for you?",
           "How do new customers find you today?",
           "F", "Log. If discovery is not a goal, they are not your customer. Note \u201chas own system\u201d."))
E.append(C("We're a chain, deals are done at head office.",
           "Process, and a polite filter.",
           "Understood. Who at head office handles partnerships, and what would they want to see before a pilot at one branch?",
           "What would a successful pilot look like for them?",
           "A", "Log the contact and criteria. Honest: you have no strong proof for chains yet; start with single-branch pilots."))

# 5I ROAST
E.append(section("I. The roast (hostile, rude, or dismissive)"))
E.append(C("This is a waste of my time.",
           "Frustrated, or protecting themselves.",
           "I hear you, sir, sorry to take your time. If I can ask only one thing: is it that weekday seats are never a problem, or that you don't want apps at all?",
           "(Only if they stay on the line.)",
           "H", "Do not argue. Log the tone and the one reason you got."))
E.append(C("You don't even play games / do you know gaming cafés?",
           "Tests your credibility.",
           "Honestly, I'm a mobile gamer, not a café regular, and that's exactly why I'm calling owners and listening. What you tell me shapes what we build. What should I know that I don't?",
           "What do outsiders get wrong about running a café?",
           "T", "Honest and humble works better than bluffing. Log what they say you should know."))
E.append(C("Do not call again.",
           "Wants to end contact.",
           "Understood, sir. I'll note it and won't call again. Sorry for the disturbance, take care.",
           "None. Do not push.",
           "H", "Log as do-not-call. Never call that number again."))
E.append(C("What have you actually done so far?",
           "Wants evidence, not words.",
           "Fair. We've built the booking app and the owner dashboard, we're live with two cafés in Hyderabad, and about 100 players have signed up. We haven't had many paid bookings yet, and I won't pretend. That's why a two-week pilot, and why I'm talking to you.",
           "What would you want to see before you'd try it?",
           "T", "Log their evidence request. Prepare a one-page proof sheet with true numbers."))
E.append(C("Your website looks sketchy.",
           "Real feedback, or a dodge.",
           "Thank you for saying that, it helps. What looks sketchy to you? I'll fix it.",
           "What would make it look more trustworthy: photos, names, reviews, something else?",
           "T", "Log exact words. This is free design feedback; pass it to your design list."))
E.append(C("Come back when you have 1,000 users.",
           "Polite no, with a number.",
           "That's fair, and I'll do exactly that. When you say 1,000, is that Hyderabad-wide or players near your café? I'd love to call you back with the real number.",
           "What number of local players would you take seriously?",
           "D", "Log the number and area. It tells you how big the audience must be for owners; follow up when you reach it."))

# ---------------- LOG + FIX MAP ----------------
E.append(PageBreak())
E.append(p("6. Turn every rejection into a product fix", H1))
E.append(p("After each call, log it in 2 minutes. Once a week, count the reasons. If the same reason shows up in <b>30% or more of 20 calls</b>, change your pitch, your proof, or your product. Do not argue with the pattern.", P))
E.append(p("Call log columns (Google Sheet)", H2))
E.append(grid([
    ["Column", "Example"],
    ["Date / time / caller", "2026-10-09 12:10, Uzair"],
    ["Café / area / pincode / chain?", "XYZ Gaming, Kompally, 500100, single"],
    ["Who I spoke to / decider?", "Manager, owner Ravi decides"],
    ["Result", "meeting / follow-up / no / do-not-call / no answer"],
    ["Reason code (T M F O W A D H)", "D"],
    ["Their words (exact quote)", "\u201cWho will even come? My seats are empty.\u201d"],
    ["Numbers they gave", "6 of 10 seats empty weekdays 11 to 4"],
    ["Next step + date", "Visit Thu 12:30"],
    ["Fix idea", "Need local player proof near Kompally"],
], [64, 110]))
E.append(Spacer(1, 6))
E.append(p("What each reason usually tells you to fix", H2))
E.append(grid([
    ["Reason", "If it keeps coming up, check", "Possible fix (pitch / proof / product)"],
    ["T Trust", "Do you have a face, a name, references, real reviews?", "Proof: reference calls from DG and Rockstar, founder video, photos. Product: clearer about page, owner testimonials."],
    ["M Money", "Is the fee clear? Are payouts fast enough?", "Pitch: say it in one sentence. Product: payout schedule, fee explainer. Collect fair-price answers before fixing 8%."],
    ["F Fit/Demand", "Is this café type right? Are there customers to bring?", "Pitch: target cafés with empty weekday hours. Product: more player demand first (votes, local audience)."],
    ["O Operations", "Is setup and staff use too hard?", "Product: 60-second staff video, simpler setup, fewer fields. Pitch: do the setup for them."],
    ["W Timing", "Are you calling at the wrong time or not asking a clear question?", "Pitch: shorter opener, better call time, a sharper ask."],
    ["A Authority", "Are you reaching the decider?", "Pitch: ask for the decider earlier; offer to explain once to both."],
    ["D Demand", "Do owners doubt that players will come?", "This is your core strategy question. Build and show local player proof before pitching more cafés."],
    ["H Hostile/Noise", "Wrong list, wrong time, wrong tone?", "Clean the list, respect do-not-call, review your opener."],
], [28, 66, 80]))
E.append(Spacer(1, 6))
E.append(p("Weekly review (20 minutes, same time every week)", H2))
E += bullets([
    "Count: calls, conversations, meetings, pilots, live cafés.",
    "Rank reason codes. Read the top five quotes out loud.",
    "Pick ONE change for next week (opener, ask, proof, or product fix).",
    "Keep what worked: copy phrases that earned a yes into this SOP.",
    "Decision rule: if after 40 calls no pilots, the problem is not your tone; it is your offer or your proof.",
])
E.append(Spacer(1, 4))
E.append(box("Roleplay drill (use Claude)", [
    "Tell me: \u201cPlay a tough café owner. Use the roast cards. Interrupt me.\u201d I will play it, then score you on listening, honesty and whether you got a next step.",
    "Do 10 minutes before your first calls of the day. Repeat any card you stumbled on until it feels natural.",
]))

# ---------------- TEMPLATES ----------------
E.append(PageBreak())
E.append(p("7. WhatsApp and message templates", H1))
E.append(grid([
    ["When", "Template"],
    ["After a good call (confirm meeting)", "Hi sir, Uzair from KHEL-O. Thanks for your time. Confirming tomorrow 12:30 at your café. I'll bring my phone and we'll set it up in 20 minutes if you like it. Free to list, no contract."],
    ["After \u201csend details\u201d", "Hi sir, Uzair from KHEL-O. 3 lines: 1) Players see your live availability and book online. 2) Free for cafés, you control which seats and which hours. 3) Payouts weekly to your UPI. Can I call tomorrow at 12 to answer questions?"],
    ["After a no (keep the door open)", "Thanks for being honest, sir. I learned a lot from your answer. If quiet weekday hours ever become a headache, you have my number. All the best with the café."],
    ["Pilot day 3", "Hi sir, quick check from KHEL-O: any bookings or anything confusing so far? Even \u201cnothing happened\u201d is useful for me."],
    ["Pilot day 14", "Sir, here are the numbers from the last 14 days: [real numbers]. What would you like to do: continue, change something, or stop? I'll be straight with you either way."],
    ["Ask for a referral", "Sir, thanks again. Is there another café owner you know who has quiet weekdays? Could I mention your name when I call?"],
], [44, 130]))
E.append(Spacer(1, 6))
E.append(box("Compliance and respect", [
    "Respect \u201cdo not call.\u201d Keep a list and never call those numbers again.",
    "Do not record calls without telling the person. Be careful about calling very early or late.",
    "Business calls can still reach numbers on a do-not-disturb registry; if someone complains, stop and log it. This is general guidance, not legal advice; check with a lawyer for your exact situation.",
], WARN, colors.HexColor("#8A5A00")))

# ---------------- SOURCES ----------------
E.append(Spacer(1, 8))
E.append(p("8. What I learned from and where", H2))
E.append(p("I searched for Saad Sells' content and found no usable first-hand material, so I did not attribute anything to him. The loop (pause, acknowledge, reframe, ask), the permission opener, and the discovery-question approach come from these widely published sources, rewritten in my own words:", P))
for t in [
    "SmartReach: 16 Common Cold Calling Objection Handling Tactics, smartreach.io/blog/cold-calling-objections-handling-on-sales-calls",
    "Gong: top objections across 300M cold calls, gong.io/blog/we-found-the-top-objections-across-300m-cold-calls-heres-how-to-handle-them-all",
    "Ahead of Sales: cold call objection handling framework, aheadofsales.co.uk/cold-call-objection-handling",
    "Closers Forge: The Permission-Based Opener, closersforge.com/blog/the-permission-based-opener",
    "Hyperbound: Permission Openers Explained, hyperbound.ai/blog/permission-openers-sales-calls",
    "Skipcall: 30 Cold Call Discovery Questions, skipcall.io/en/blog/cold-call-discovery-questions",
    "Leads at Scale: Cold Calling Objection Library, leadsatscale.com/insights/cold-calling-objection-library-responses-that-work",
]:
    E.append(Paragraph(esc(t), S("src", fontSize=8, leading=11, textColor=MUTED, leftIndent=10, bulletIndent=2), bulletText="\u2022"))
E.append(Spacer(1, 4))
E.append(p("Items marked [CONFIRM] are facts about your fees, refunds, taxes or data policy that I could not verify from the code. Confirm each one before you say it on a call.", SM))

doc.build(E)
print("built")
