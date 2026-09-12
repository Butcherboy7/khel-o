"""Researched details for the 22 real cafes in the "all cafes" source set.

Task 13 of docs/superpowers/plans/2026-09-10-explore-real-cafes.md.
No DB writes happen here -- this is data only, consumed by seed_real_cafes.py.

READ THIS BEFORE EDITING
------------------------
Every non-None value below carries a `*_source` URL for the page it was read
off. The rule from the spec is absolute: **no source URL means the field is
None, not "probably"**. A None here is a success, not a gap -- the card shows
"Booking soon" and hides what we do not know, which is the whole point of the
lead-listing model.

Do NOT fill a None from a search-engine summary. Those summaries are
model-generated and were wrong repeatedly during this research pass:
  * a phone number for 1vX that contradicted the cafe's own website
  * a "Rs 50/hour" for Echo Esports taken from a page whose own text reads
    "Exact prices change. Do not rely on any article, including this one, for
    current rates."
  * a recommendation to check zegagaming.com, a domain that does not resolve
Only a page that was actually opened counts as a source.

`address_*` fields are taken from the user-supplied .txt in each cafe folder,
NOT from the web, because that is the data the venue set was built from. Where
a fetched page disagreed with the .txt the .txt wins and the conflict is
recorded in `notes` -- it is a question for the venue, not for us to resolve.

Schema note: `tiers` is a list of confirmed hardware/price rows. An empty list
means no confirmed hardware, which renders as "Hardware coming soon". A tier
with total_seats=None has a confirmed price but no confirmed capacity, so it
cannot become bookable until the venue supplies the seat count.
"""

PLACEHOLDER_PHONE = "0000000000"  # sentinel used by seed_lead_cafes.py for unconfirmed

# ---------------------------------------------------------------------------
# Identity conflicts that must be resolved by a human before seeding.
# Each of these would publish a false claim about a real business if seeded
# as-is. seed_real_cafes.py must refuse to run while any is unresolved.
# ---------------------------------------------------------------------------
BLOCKING_CONFLICTS = [
    {
        "slugs": ["megagamerz.vignannagar", "megagaming.events"],
        "issue": "Byte-identical address in both source folders, and both .txt "
                 "strings name 'Megagamerz Gaming Cafe'. The magicpin listing is "
                 "titled 'Megagamerz Gaming Cafe - eSports Event Management "
                 "Company and Gaming Equipment Rentals', i.e. one business with "
                 "two Google listings (cafe + event-management arm).",
        "risk": "Seeding both puts two Explore cards on one venue.",
        "source": "https://magicpin.in/Bangalore/Vignana-Nagar/Other/Megagamerz-Gaming-Cafe-Esports-Event-Management-Company-And-Gaming-Equipment-Rentals/store/197a585",
    },
    {
        "slugs": ["quantum.sainikpuri", "rebellion.sainikpuri"],
        "issue": "Byte-identical address in both source folders. Rebellion "
                 "eSports own website lists only two branches -- Madhapur and "
                 "LB Nagar -- and no Sainikpuri location at all.",
        "risk": "Almost certainly a mis-attributed address. Seeding 'Rebellion "
                "Gaming Cafe' at Quantum's address publishes a false location "
                "for two real businesses.",
        "source": "https://rebellionesports.gg/",
    },
    {
        "slugs": ["goat.jayanagar"],
        "issue": "A different business, 'Next Level - The Gaming Cafe', is "
                 "listed at the same address (94, Aikya Complex, 2nd Floor, 7th "
                 "Cross, 1st Block, Ashoka Pillar Rd, Jayanagar).",
        "risk": "One of the two has moved or closed; we do not know which is "
                "currently at the premises.",
        "source": "https://www.justdial.com/Bangalore/Next-Level-The-Gaming-Cafe-Jayanagar/080PXX80-XX80-250122201211-A3G2_BZDET",
    },
    {
        "slugs": ["valhalla.gachibowli"],
        "issue": "No web presence found under this name at all -- no website, "
                 "listing, or social account. Either very new, or the folder "
                 "name is not the trading name.",
        "risk": "Cannot confirm the business exists or is open.",
        "source": None,
    },
]

# Cafes that are not independent PC/console gaming cafes. Not a blocker, but a
# product decision about whether they belong in this Explore set.
CATEGORY_REVIEW = ["gameextreme.madhapur", "timezone.gvkone"]

# ---------------------------------------------------------------------------
# Bengaluru (source folder: "all cafes/banglore" -> Bengaluru / Karnataka)
# ---------------------------------------------------------------------------
BENGALURU = [
    {
        "slug": "1vx.indiranagar",
        "name": "1vX Gaming",
        "folder": "banglore/1vx gaming cafe",
        "address_line1": "2nd Floor, NR Plaza, 39/7, 7th Main Rd, opposite Dr. Ambedkar college Ground, Motappapalya",
        "address_line2": "Indiranagar",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560038",
        "phone_number": "+919164908588",
        "phone_confirmed": True,
        "phone_source": "https://www.1vx.in/",   # verbatim "1vX Indiranagar: +91 91649 08588"
        "opening_time": None, "closing_time": None,   # not on official site
        "tiers": [],   # RTX 4070 Super / 240Hz / PS5 confirmed, but no seat count or price
        "hardware_notes": "RTX 4070 Super & 240Hz monitors; PS5",
        "hardware_source": "https://www.1vx.in/",
        "notes": "Chain -- a second branch exists in Jayanagar (+91 91649 08488). "
                 "A search summary asserted 070198 91995 and 11:00-23:00; the "
                 "phone contradicted the cafe's own site and the hours were "
                 "absent from it, so both were rejected.",
    },
    {
        "slug": "blitz.rajajinagar",
        "name": "Blitz Esports",   # folder says "blitz gaming cafe"; own site trades as Blitz Esports (B1)
        "folder": "banglore/blitz gaming cafe",
        "address_line1": "1190, 18th C Main Rd, 5th Block",
        "address_line2": "Rajajinagar",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560010",
        "phone_number": "+919429690001",
        "phone_confirmed": True,
        "phone_source": "https://www.blitzesports.gg/locations",
        "opening_time": "09:00", "closing_time": "23:00",
        "hours_source": "https://www.blitzesports.gg/locations",   # "Open 365 days 9AM-11PM"
        "tiers": [],
        "hardware_notes": None,
        "notes": "Own site confirms this exact address as 'B1 - Rajajinagar' and "
                 "adds '1st Floor'. Chain -- B2 Mathikere shares the phone "
                 "number, so the number may reach a central line.",
    },
    {
        "slug": "colosseum.sadduguntepalya",
        "name": "Colosseum E-Sports",
        "folder": "banglore/Colosseum E-Sports",
        "address_line1": "2nd Floor, 12, Hosur Main Road, above Concept furniture, Venkateshwara Layout",
        "address_line2": "Sadduguntepalya",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560029",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "name_source": "https://highape.com/bangalore/venues/colosseum-e-sports",
        "notes": "highape gives pincode 560030, the source .txt says 560029 -- "
                 "kept the .txt. Search results conflate this with 'Gamerz "
                 "Colosseum' (a separate Justdial listing near Christ College); "
                 "ignored. A 'Rs 30-100/hr' figure appeared only in an "
                 "unattributed search summary and was rejected.",
    },
    {
        "slug": "dsd.shantinagar",
        "name": "DSD Premium Gaming",
        "folder": "banglore/dsd.premiumgaming",
        "address_line1": "546, 5, Langford Rd, opposite HOCKEY STADIUM, Akkithimana Halli, Bheemanna Garden",
        "address_line2": "Shanti Nagar",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560027",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "dsdpremiumgaming.com resolves but carries only the business "
                 "name -- no address, hours, phone or prices. A search summary "
                 "placed it at 46/3 Kalinga Rao Rd, Sampangi Rama Nagara, an "
                 "adjacent but different locality from the .txt; unresolved.",
    },
    {
        "slug": "echo.basavanagudi",
        "name": "Echo Esports Gaming Cafe",
        "folder": "banglore/echo esports gaming cafe",
        "address_line1": "4th floor & 5th Floor, 1, National High School Road, near National High School, Vishweshwarapura",
        "address_line2": "Basavanagudi",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560004",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "The cafe where a search summary produced the most specific "
                 "numbers (Rs 50/hr, RTX 4060 standard, RTX 4070 Ti flagship, "
                 "240Hz, 'Saturdays fill up 90 minutes ahead') and every one was "
                 "absent from the page it cited, which states: 'Exact prices "
                 "change. Do not rely on any article, including this one, for "
                 "current rates.' All rejected. Chain -- a Shanti Nagar / Andree "
                 "Road branch also exists.",
    },
    {
        "slug": "laegamers.kalyannagar",
        "name": "Laegamers Lounge",   # folder says "Lae  gaming lounge"
        "folder": "banglore/Lae  gaming lounge",
        "address_line1": "First Floor, No. 409, 5th Main Rd, HRBR Layout 2nd Block, HRBR Layout",
        "address_line2": "Kalyan Nagar",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560043",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "Registered as 'LA E-GAMERS Private Ltd' per its LinkedIn page. "
                 "A phone number (+919538194455) appeared only in an unattributed "
                 "search summary -- left unconfirmed rather than seeded.",
    },
    {
        "slug": "lxg.domlur",
        "name": "League of Extraordinary Gamers (LXG)",
        "folder": "banglore/League of extra ordinary numbers",
        "address_line1": "Ground Floor, 12th Cross, 15, Paramahansa Yogananda Rd, HAL 2nd Stage",
        "address_line2": "Domlur",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560071",
        "phone_number": "+918122874175",
        "phone_confirmed": True,
        "phone_source": "https://www.lxgindia.com/contact.html",
        "opening_time": None, "closing_time": None,   # not on official contact page
        "tiers": [],
        "hardware_notes": None,
        "notes": "Official contact page gives pincode 560008 against the .txt's "
                 "560071 -- kept the .txt. The folder name 'League of extra "
                 "ordinary numbers' is a transcription error for 'Extraordinary "
                 "Gamers'; do not seed the folder name as the venue name.",
    },
    {
        "slug": "megagamerz.vignannagar",
        "name": "MegaGamerz Gaming Cafe",
        "folder": "banglore/mega gamerz",
        "address_line1": "Bearing No. 2, 2nd Floor, Megagamerz Gaming Cafe, 1st A Main Rd, Vignan Nagar, LBS Nagar",
        "address_line2": "Vimanapura",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560037",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "BLOCKING: duplicate of megagaming.events, see "
                 "BLOCKING_CONFLICTS. megagamerz.in does not resolve. A search "
                 "summary gave +91 8217488181, 'Mon-Fri 11:30am-2am' and pincode "
                 "560075; none attributable to an opened page, all rejected.",
    },
    {
        "slug": "megagaming.events",
        "name": "Mega Gaming Event Management",
        "folder": "banglore/mega gaming event management",
        "address_line1": "Bearing No. 2, 2nd Floor, Megagamerz Gaming Cafe, 1st A Main Rd, Vignan Nagar, LBS Nagar",
        "address_line2": "Vimanapura",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560037",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "BLOCKING: same address and same venue name as "
                 "megagamerz.vignannagar. Likely the event-management arm of the "
                 "same business rather than a separate venue. Recommend NOT "
                 "seeding this one.",
    },
    {
        "slug": "goat.jayanagar",
        "name": "The G.O.A.T Gaming Cafe",
        "folder": "banglore/The goat gaming cafe",
        "address_line1": "94, Aikya Complex, 2nd floor, 7th Cross, Ashoka Pillar Rd, above Dominos Pizza, 1st Block",
        "address_line2": "Jayanagar",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560011",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "BLOCKING: 'Next Level - The Gaming Cafe' is listed at the same "
                 "address, see BLOCKING_CONFLICTS. A phone (8884655514) and a "
                 "PC/PS5/pool/racing-sim mix appeared only in an unattributed "
                 "search summary; rejected.",
    },
    {
        "slug": "zega.btmlayout",
        "name": "Zega Gaming",
        "folder": "banglore/zega gaming",
        "address_line1": "First Floor, #1204, Aravinda Nethre, 16th Main Rd, Mahadeshwara Nagar, BTM Layout 2nd Stage",
        "address_line2": "BTM Layout",
        "city": "Bengaluru", "state": "Karnataka", "pincode": "560076",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "zegagaming.com does not resolve (DNS failure), despite a search "
                 "summary recommending it as the place to find their hours.",
    },
]

# ---------------------------------------------------------------------------
# Hyderabad (source folder: "all cafes/hyderabad")
# ---------------------------------------------------------------------------
HYDERABAD = [
    {
        "slug": "clashofconsoles.vanasthalipuram",
        "name": "Clash of Consoles",   # folder says "clash of console" (singular)
        "folder": "hyderabad/clash of console",
        "address_line1": "H NO B-958, beside KOTAK BANK LANE, NGO Colony",
        "address_line2": "Vanasthalipuram",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500070",
        "phone_number": "+918522006115",
        "phone_confirmed": True,
        "phone_source": "https://clashofconsoles.com/",   # also lists +91 99897 72103
        "opening_time": "10:00", "closing_time": "23:00",
        "hours_source": "https://clashofconsoles.com/",   # "10:00 AM - 11:00 PM" for Vanasthalipuram
        "tiers": [
            # PS5 pricing is per-room by player count, not per-seat, so only the
            # single-player rate maps onto an hourly tier. The 2/3/4-player rates
            # (Rs 250/300/350 per hour) need a group-pricing model we do not have.
            {"name": "PS5", "price_per_hour": 200, "total_seats": None,
             "source": "https://clashofconsoles.com/"},
        ],
        "hardware_notes": "PS5; VR; racing simulator",
        "hardware_source": "https://clashofconsoles.com/",
        "notes": "Own site confirms the .txt address including pincode 500070. "
                 "Chain -- a second branch at Sheriguda, Ibrahimpatnam, closes "
                 "an hour earlier (10:00-22:00), so do not reuse these hours for "
                 "it. Seat counts are not published, so the tier above has "
                 "total_seats=None and cannot be bookable yet.",
    },
    {
        "slug": "cyberhok.himayatnagar",
        "name": "CyberHok Gaming",
        "folder": "hyderabad/cyberhok gaming cafe",
        "address_line1": "3-5-907/E/2, 2nd floor, CyberHok Gaming, beside Bharat Petrol Pump, Venkata swamy Nagar",
        "address_line2": "Himayatnagar",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500029",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "A search summary claimed 'open 24 hours' and a 4.30/5 rating "
                 "from 60 reviews, neither attributable to an opened page. Both "
                 "rejected -- a wrong 24-hour claim sends players to a closed "
                 "venue at 3am, which is worse than showing no hours.",
    },
    {
        "slug": "g5arena.gachibowli",
        "name": "G5 Arena",
        "folder": "hyderabad/g5 arena",
        "address_line1": "Masjid Banda Main Rd, Masjid Banda, NCB Enclave",
        "address_line2": "Gachibowli",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500084",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "Trades as 'G5 Arena (Snooker and Gaming Lounge)' and is listed "
                 "under Kondapur as often as Gachibowli. An 'open until 12am' "
                 "claim was unattributed; rejected.",
    },
    {
        "slug": "gameextreme.madhapur",
        "name": "Game Extreme Bowling",
        "folder": "hyderabad/game extreme bowling",
        "address_line1": "Metro Station, inside E Galleria Mall, near Hitech City, Silicon Valley",
        "address_line2": "Madhapur",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500081",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "CATEGORY REVIEW: a bowling/arcade venue inside a mall, not a "
                 "PC/console gaming cafe. Decide whether it belongs in this "
                 "Explore set at all before seeding.",
    },
    {
        "slug": "gamersguild.banjarahills",
        "name": "Gamers Guild",
        "folder": "hyderabad/gamers guild",
        "address_line1": "Municipal No, 8-2-618/2A, 5th Floor, Block A, Delta Seacon Building, Rd Number 11",
        "address_line2": "Banjara Hills",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500034",
        "phone_number": "+918639713524",
        "phone_confirmed": True,
        "phone_source": "https://gamersguild.in/locations/banjara-hills",
        # Own site says only "Open late" for this branch. The "11:00 AM to 1:00 AM"
        # on the pricing page belongs to the BEGUMPET branch -- deliberately not
        # copied across.
        "opening_time": None, "closing_time": None,
        "tiers": [
            {"name": "PC (RTX 4060)", "price_per_hour": 200, "total_seats": 35,
             "source": "https://gamersguild.in/pricing"},
            {"name": "PlayStation 5", "price_per_hour": 250, "total_seats": None,
             "source": "https://gamersguild.in/pricing"},
            {"name": "Nintendo Switch", "price_per_hour": 250, "total_seats": None,
             "source": "https://gamersguild.in/pricing"},
            # Weekday 60-minute rate. Weekend is Rs 1,100 and off-peak 30 min is
            # Rs 300; we have no model for time-varying prices, so the weekday
            # hourly rate is the only one recorded.
            {"name": "Racing Simulator", "price_per_hour": 800, "total_seats": 3,
             "source": "https://gamersguild.in/pricing"},
            # Rs 600 for 60 min (Rs 399 for 30 min).
            {"name": "VR (Meta Quest 3)", "price_per_hour": 600, "total_seats": None,
             "source": "https://gamersguild.in/pricing"},
        ],
        "hardware_notes": "35 premium PCs on Nvidia RTX 4060s; three F1-spec Simagic "
                          "racing sims (two triple-monitor, one single); Meta Quest 3 "
                          "VR zone; PS5 lounge; Nintendo Switch zone",
        "hardware_source": "https://gamersguild.in/locations/banjara-hills",
        "notes": "The best-documented cafe in the set -- prices and hardware come "
                 "from the venue's own published pricing page. Own site gives the "
                 "street number as 8-2-816 against the .txt's 8-2-618/2A; kept "
                 "the .txt. Chain -- the Begumpet branch is cheaper (PC Rs 150/hr), "
                 "so these prices must not be reused for it.",
    },
    {
        "slug": "valhalla.gachibowli",
        "name": "Gamers Valhalla",
        "folder": "hyderabad/gamers valhalla",
        "address_line1": "3rd floor, Ragava plaza, F.No: 302, opposite Vaikuntapuram restaurant, Kondapur, Raghavendra Colony",
        "address_line2": "Gachibowli",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500084",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "BLOCKING: no web presence found under this name at all, see "
                 "BLOCKING_CONFLICTS. The only Kondapur match was 'VR Gaming "
                 "Cafe', which Justdial marks Closed Down, at a different "
                 "address -- so not treated as the same venue.",
    },
    {
        "slug": "ignite.gudimalkapur",
        "name": "Ignite - Premium Gaming Lounge & PC Store",
        "folder": "hyderabad/ignite",
        "address_line1": "First Floor, opposite National Mart, above Chai Chaska, Viswash Nagar",
        "address_line2": "Gudimalkapur",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500006",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "Justdial places the same 'opposite National Mart, above Chai "
                 "Chaska' premises in LIC Colony / Amba Gardens / Mehdipatnam at "
                 "pincode 500028, against the .txt's Gudimalkapur 500006. The "
                 "landmarks match exactly, so this is one venue with a disputed "
                 "locality -- worth asking the owner.",
    },
    {
        "slug": "mng.dilsukhnagar",
        "name": "MNG Gaming Cafe",
        "folder": "hyderabad/MnG gaming cafe",
        "address_line1": "House no : 7, 49, Konark Theatre Ln, opposite to satyanarayana swamy temple, Gaddiannaram, Madhura Puri Colony",
        "address_line2": "Dilsukhnagar",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500070",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "A search summary gave a different address (8-51, G1 Sri Sai "
                 "Durga Nivas, Goutham Nagar, Saroornagar, 500060) and a "
                 "PS5/PC/snooker/board-games mix; neither attributable to an "
                 "opened page. Trademark filed as 'mng-gaming-cafe'.",
    },
    {
        "slug": "quantum.sainikpuri",
        "name": "Quantum Esports Gaming Arena",
        "folder": "hyderabad/quantum esports gaming arena",
        "address_line1": "40, Sai Nagar Rd, near UNITED CHURCH, Sai Baba Officers Colony",
        "address_line2": "Sainikpuri",
        "city": "Secunderabad", "state": "Telangana", "pincode": "500094",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "BLOCKING: shares this address with rebellion.sainikpuri, see "
                 "BLOCKING_CONFLICTS. quantumesports.in could not be fetched "
                 "(TLS handshake failure), so nothing is confirmed from the "
                 "venue's own site. Of the pair, this is the one the evidence "
                 "supports actually being at this address.",
    },
    {
        "slug": "rebellion.sainikpuri",
        "name": "Rebellion Gaming Cafe",
        "folder": "hyderabad/rebellion gaming cafe",
        "address_line1": "40, Sai Nagar Rd, near UNITED CHURCH, Sai Baba Officers Colony",
        "address_line2": "Sainikpuri",
        "city": "Secunderabad", "state": "Telangana", "pincode": "500094",
        "phone_number": PLACEHOLDER_PHONE, "phone_confirmed": False,
        "opening_time": None, "closing_time": None,
        "tiers": [],
        "hardware_notes": None,
        "notes": "BLOCKING: Rebellion eSports own site lists only Madhapur and "
                 "LB Nagar -- no Sainikpuri branch -- yet this folder carries "
                 "Quantum's exact address. Recommend NOT seeding until the venue "
                 "identity is established. Incidentally its site names an "
                 "affiliate 'Cafe Game Theory' in Kompally, which is already a "
                 "lead in seed_lead_cafes.py with a matching phone number.",
    },
    {
        "slug": "timezone.gvkone",
        "name": "Timezone GVK One Mall",
        "folder": "hyderabad/Timezone GVK One Mall",
        "address_line1": "4th Floor, Gvk One Mall, Banjara Hills Rd Number 1, Balapur Basthi",
        "address_line2": "Banjara Hills",
        "city": "Hyderabad", "state": "Telangana", "pincode": "500034",
        "phone_number": "9549308309",
        "phone_confirmed": True,
        "phone_source": "https://www.timezonegames.com/en-in/party-booking/south/gvk-one-mall/",
        "opening_time": "11:00", "closing_time": "22:00",
        "hours_source": "https://www.timezonegames.com/en-in/party-booking/south/gvk-one-mall/",
        "tiers": [],
        "hardware_notes": "Arcade, bowling, bumper cars, interactive VR",
        "hardware_source": "https://www.timezonegames.com/en-in/party-booking/south/gvk-one-mall/",
        "notes": "Fully confirmed from the operator's own venue page; hours are "
                 "identical all seven days. CATEGORY REVIEW: Timezone is a "
                 "national arcade/bowling chain, not an independent gaming cafe, "
                 "and is the least likely venue in this set to ever claim a "
                 "KHEL-O listing. Consider excluding.",
    },
]

ALL_CAFES = BENGALURU + HYDERABAD

assert len(ALL_CAFES) == 22, f"expected 22 cafes, got {len(ALL_CAFES)}"
assert len({c["slug"] for c in ALL_CAFES}) == 22, "slugs must be unique"

# Every confirmed value must be able to name the page it came from. This is the
# spec's core rule made executable, so a later edit that adds a price without a
# source fails at import rather than reaching a real business's listing.
for _c in ALL_CAFES:
    if _c["phone_confirmed"]:
        assert _c.get("phone_source"), f"{_c['slug']}: confirmed phone without a source URL"
    if _c["opening_time"] or _c["closing_time"]:
        assert _c.get("hours_source"), f"{_c['slug']}: hours without a source URL"
    if _c.get("hardware_notes"):
        assert _c.get("hardware_source"), f"{_c['slug']}: hardware notes without a source URL"
    for _t in _c["tiers"]:
        assert _t.get("source"), f"{_c['slug']}: tier {_t['name']!r} without a source URL"
