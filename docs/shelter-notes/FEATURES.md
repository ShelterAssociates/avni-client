# Shelter Associates × Avni — feature documentation

Everything the Shelter build of the Avni mobile app does that stock Avni does not.
Written for whoever picks this up next: field staff explaining it, an admin configuring it,
or a developer changing it.

_Current release: 1.2.1. Fork of `avni-client` (`ShelterAssociates/avni-client`), branch `shelter-master`._

---

## 1. What this build is for, in one paragraph

Shelter Associates surveys slum households with the Avni app, and separately digitises every
slum's building footprints in its own GIS server (`app.shelter-associates.org`). This build joins
the two. The surveyor sees a satellite map of the slum with every building drawn on it, taps the
house they are standing in front of instead of typing a house number, and the app records
"household X lives in footprint Y" back on the GIS server. The same map doubles as a browsing
tool — who lives where, what did they answer, which houses are still unsurveyed — and it keeps
working with no network.

---

## 2. The slum map

The map opens full screen. From top to bottom: header, search box, two dropdowns and a menu
button, the filter chips, the map itself, and a bar along the bottom.

### 2.1 What is drawn

| Layer | Appearance |
|---|---|
| Building footprints | Filled polygons, coloured by whatever colouring is active |
| Slum boundary | Yellow dashed outline |
| Satellite imagery | Google tiles, **online only** |
| House numbers | Optional labels on each building (see 2.5) |

Footprints are drawn on a canvas rather than as individual SVG shapes, so a slum with a thousand
buildings still pans and zooms smoothly. Striped buildings (duplicates) are the one exception and
use SVG.

### 2.2 Colouring by survey status

The default. Every building takes a colour from its survey state:

| Colour | Meaning |
|---|---|
| Green | Not surveyed — nobody registered here |
| Orange | Registered — exactly one household |
| Red / white / orange stripes | Registered more than once — two or more households on the same house number |
| Blue | Currently selected |
| Purple | Matched your search |
| Faint grey | Hidden, because you unticked its colour in the legend |

### 2.3 Colouring by an answer

The **"Colour houses by"** dropdown lets you colour the map by the answer to any survey question
instead of by status. Pick "Has own toilet" and every house takes the colour of its answer, so the
whole slum can be read at a glance.

- Answers come from the registration form first, then the household's enrolments, then its visits
  (newest first) — across every programme and visit type the worker is allowed to see
- A house with several households shows the first household's answer
- Multi-select answers combine into one label, e.g. "Yes + Shared"
- An answer that already has a colour on the Shelter website keeps **the same colour in the app**;
  anything else is assigned from a 16-colour palette, and within one question no two answers share
  a colour until all 16 are used
- Each filter shows how many households answered it; filters nobody has answered are not offered
- A **Duplicates** filter appears whenever any house has more than one household, labelled with
  how many registrations each house has

**Which questions are offered:** the concepts chosen in Shelter admin (see 6.2) come first, then
every other coded question from the forms the worker can view. Choosing some in admin therefore
promotes them to the top without hiding the rest.

### 2.4 The filter chips — every colour is a clickable checkbox

Below the dropdowns sits a row of chips. **This row is the legend and the control at the same
time: each chip is a tick-box you can click.**

- Each chip shows a colour swatch and its label, e.g. a green swatch with "Not surveyed"
- **Clicking a chip toggles it.** Ticked (a tick mark drawn on the swatch) means those houses are
  shown in their colour. Unticked means they fade to grey on the map and lose their number labels,
  and the label is struck through in the chip
- This works both for survey statuses (Not surveyed / Registered / Registered more than once) and
  for every answer of whatever filter is active — so you can, for example, untick "Yes" and leave
  only the "No" houses visible
- The "no data" chip under an active filter is informational and is not clickable
- Chips are **bricks that wrap**: each is only as wide as its text needs, and they flow onto as
  many rows as required — short labels give three or four per row, long labels one or two. There
  is **no horizontal scrolling**
- The chip area is only as tall as the chips need. Past roughly three rows it scrolls
  **vertically**, and the map starts immediately below it with no wasted white space

### 2.5 House number labels — two separate toggles

The first two chips control the numbers printed on the buildings:

| Chip | Effect |
|---|---|
| **All house numbers** | Numbers **every** building in view, ignoring the active filter and ignoring any chips you have unticked — faded houses still get their number |
| **Filter house numbers** | Numbers only the houses the active filter or status colouring is currently showing |

They are independent tick-boxes. If both are ticked, **"All" wins**. With neither ticked, no
numbers are drawn. Labels are only rendered for buildings currently on screen, so turning them on
in a large slum stays fast.

### 2.5a The legend: counts, and folding it away

Every legend row shows **how many structures the map is drawing in it** — `Registered (810)`,
`Yes (391)`. Under a filter the legend also lists the two greys, so every colour on screen has a
row and the numbers add up to the whole slum:

| Row | Means |
|---|---|
| one row per answer | houses whose household gave that answer |
| **No data (n)** | a household is registered, but it did not answer this question |
| **Not surveyed (n)** | nobody is registered on that structure |

`Selected` and `Search result` carry no count — they are what you are doing, not a category of
house. A category nothing is drawn in is left out rather than shown as `(0)`.

Unticking a row greys its houses but **keeps its count**: the number says how many houses are in
that category, which does not change because you hid them.

The legend header — `Legend · 4 categories` — **folds the legend away** when tapped, giving the
whole strip back to the map; tap again to bring it back. It starts open, and whichever way you
leave it stays that way as you switch filters.

### 2.6 Searching for a house

- Type into the search box at the top and **suggestions appear as you type**, listing matching
  house numbers with their state — "Not surveyed", "Registered", or "3 households"
- Tap a suggestion, or press search, and the map zooms to that house and turns it purple
- Matching ignores padding and spacing, so `35`, `0035` and ` 35 ` all find the same house, and
  `22A` matches `0022 A`
- Letters are accepted — the keyboard is the normal one, not a number pad
- A number the **latest sync does not cover** — never digitised, or removed from the website since —
  is not a dead end: *"#35 is not on the map. It is not among the structures from the latest sync.
  Register it as an extra house?"* Answering **Register** opens the extra-house box with the number
  already filled in (see 2.9)
- The × clears the box

### 2.7 Choosing what you are looking at

- **Slum** dropdown — only shown when the worker is assigned more than one slum. Switching reloads
  the map for that slum
- **Colour houses by** dropdown — survey status, or any available filter

Both open as **full-screen scrollable lists with a search box at the top**, so a long list of
filters is fully reachable rather than being clipped by the map underneath.

### 2.8 Selecting a house

Tap any building and it turns blue. What happens next depends on what is there:

| Situation | Bottom bar shows | Household card |
|---|---|---|
| Nobody registered | "Nobody registered here" / "Selected structure" + **Register here** / **Use this** | — |
| One household | "Already registered" + **View household** | Name, `#number`, registration date, up to four answers with the first in bold |
| Several households | "N households registered here" + **View households** | — (a list appears so you can choose) |

The × clears the selection.

### 2.9 Houses that are not on the map

Some households have no footprint drawn — the building was never digitised, it is a newly
built house, or the structure it sat on was removed when the slum was re-digitised. The
**house-plus button** beside the dropdowns handles these, and carries a **count badge** when
there are any, so the map says up front how much of the slum it cannot show:

| Option | What it does |
|---|---|
| **Register extra house** | Asks for a house number, then opens the normal registration form for it |
| **Extra households (n)** | Lists every household in this slum whose number matches no building, with its name and registration date; tap one to open it |

Two rules keep the data clean:

- A number that **is** drawn on the map is refused — *"That house is on the map — pick it there
  instead."* This stops the same house being registered both ways
- A number **another household already uses** is refused — *"A household is already registered on
  that number."* House numbers therefore stay unique within the slum
- An empty box is refused — *"Type a house number."*

Because these houses have no footprint, no household↔building link is sent to the GIS server for
them — there is nothing to link them to.

### 2.10 When a slum has no structures at all

A slum can arrive with nothing to tap: it has not been digitised yet, nothing has synced yet, or
its structures were removed on the website. Instead of the map, the screen then shows
**Register extra household** as a full-width button, with that slum's **recent registrations**
listed below it — number, registration date, tappable to open the household. The slum dropdown
stays available for a worker assigned to several slums.

There is nothing to tap, so a household can only be recorded through the extra-house flow — which
is exactly right when no building footprint exists to attach it to.

---

## 3. Registering from the map

1. Choose a registration form (from the Register page, or via the map button — see 4)
2. The map opens; tap the house you are standing at
3. Tap **Register here** / **Use this**
4. The registration form opens with the **house number already filled in**
5. On save, the household↔building link is recorded on the GIS server

**House numbers are written in Avni's format.** The GIS server stores them unpadded, Avni expects
them padded to four digits, so the app converts on the way in:

| Picked on the map | Saved in Avni |
|---|---|
| `1` | `0001` |
| `12` | `0012` |
| `1234` | `1234` |
| `1A` | `0001A` |
| `123A` | `0123A` |

A number already four digits or longer is left as it is, and a non-numeric identifier is left
untouched.

**The map stays underneath the form.** Pressing Back from the registration returns you to the map
exactly as you left it — same slum, same filter, same zoom, same selected house — so you can
register one house after another without going back to the dashboard each time. On returning, the
map immediately re-reads what is registered: the house you just filled changes colour, its number
label updates, the filter counts update, and the household card refreshes — without the map moving.

---

## 4. Getting to the map

Three ways in:

| Entry point | Mode |
|---|---|
| **Register** page → choose a form | Pick mode — choosing a house starts that registration |
| **Home** dashboard → round map button | Browse mode |
| **Menu → Slum map** | Browse mode |

The two browse entries first ask **"What are you filling?"**, listing the same choices as the
Register page. Picking one decides which subject type the map shows and which registration
**Register here** will start. If only one choice qualifies, the map opens straight away.

The map button and the menu entry **disappear entirely** when no registration form is configured
to use the map, when no slum has been synced, or when the worker may not register anything — so
there is never a button that leads nowhere.

---

## 5. Which forms use the map

Not every form should go through the map. A quick observation visit does not need a building
picked; a household survey does.

**This is configured in Shelter admin, per form, and needs no app release.** Each subject
registration form has an **"opens the slum map"** tick-box:

- **Ticked** → Map → house → form
- **Not ticked** → the form opens **directly**, with no map in between

The choice reaches the phone with the normal GIS download during sync. Until any form is ticked,
the app behaves as before and shows the map for every registration.

The "What are you filling?" chooser lists only map-enabled forms, so the two stay consistent.

---

## 6. Configuring it on the Shelter server

### 6.1 Making a slum's map available
1. Digitise the footprints as `Structure` components (or `HouseBaseLayer`) and upload the slum
   boundary
2. Add the slum's Avni AddressLevel uuid to `avni/data/slum_location_uuids.json`; restart
3. The surveyor syncs once on a good connection, after which the map works offline

### 6.2 Choosing which questions become filters
Shelter admin → **AVNI form questions** → filter by data type *Coded* → tick the questions →
action **"Show selected concepts as map filters"**. They can then be reordered or switched off
under **Map filters**. The order also decides the order of answers on the household card.

### 6.3 Choosing which forms open the map
Shelter admin → **AVNI forms** → filter by form type *Subject registration* → tick
**"opens the slum map"** on the forms that should use it.

Both take effect on the phone after the next sync.

---

## 7. Sync

After every successful Avni sync, the app:

1. Sends any queued household↔building links to the GIS server, retrying ones that failed earlier
2. Downloads the footprints, boundary, filter colours and form configuration for **every** synced
   slum, showing progress on the sync screen — *"Downloading map 2/4: Alase Slum"*
3. Reports what happened — *"Maps updated for 4 slum(s)"*, or how many could not be downloaded

A failed download never blocks or fails the Avni sync. A response containing **less** data than
the phone already holds is ignored and the existing copy kept, so a server problem cannot wipe a
slum's map off a surveyor's phone.

---

## 8. Working offline

Everything except the satellite imagery works with no network:

- The mapping library ships **inside the app**, so the map draws with no internet at all
- Footprints are downloaded during sync and read from the phone's own storage
- Colouring, filters, labels, search, selection and registration all work offline
- Household↔building links are queued on disk and sent after the next sync
- A banner explains when imagery is unavailable: *"No internet: satellite imagery is unavailable,
  structures are still shown"*

A similar banner appears when a slum has no footprints yet: *"Structures are not available for X
yet. Only the slum boundary is shown."*

---

## 9. Appearance

- Shelter Associates × Avni branding on the top-level screens (Home, Register, Search, Menu)
- Both logos side by side on the start-up, login, server-address and error screens
- The map screen fits the device's navigation bar, so its bottom buttons are never hidden behind
  the system back/home buttons

---

## 10. Turning it all off

The GIS server address and key are built into the app at release time. **Without them every GIS
feature stays silently off** — no map downloads during sync, no map button, no map in
registration — and the app behaves exactly like stock Avni. This is what makes the same codebase
safe to build for organisations that do not use the GIS integration.
