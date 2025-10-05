import streamlit as st
import pandas as pd
import requests
from io import StringIO

# ──────────────────────────  PAGE CONFIG  ──────────────────────────────────────
st.set_page_config(page_title="Disney Halloween Adventure", page_icon="🎃", layout="wide")

# ─────────────────────────  GLOBAL THEME / CSS  ────────────────────────────────
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=UnifrakturCook:wght@700&family=Lato:wght@400;600&display=swap');

    html,body,[data-testid="stApp"]{
        height:100%;
        background:linear-gradient(-45deg,#0d0d0d,#1a0b1f,#2d1238,#ff6b00);
        background-size:400% 400%;
        animation:gradientMove 100s ease infinite;
        font-family:'Lato',sans-serif;
        color:#fff;
    }
    @keyframes gradientMove{
        0%{background-position:0% 50%;}
        50%{background-position:100% 50%;}
        100%{background-position:0% 50%;}
    }

    header[data-testid="stHeader"]{display:none;}

    @keyframes flicker {
      0%, 92%, 100% {opacity:1;}
      94%, 96%, 98% {opacity:0.7;}
    }

    h1,h2,h3{
        font-family:'UnifrakturCook',cursive;
        letter-spacing:1px;
        color:#ffb347;
        text-shadow:2px 2px 10px #ff6b00aa, 0 0 30px #ff8c0033;
        animation:flicker 8s infinite;
    }

    #filter-box{position:sticky;top:.5rem;z-index:998;}

    .stRadio>label,.stSelectbox label{
        font-weight:600;font-size:1.05rem;color:#fffa;
    }

    .food-card{
        background:rgba(255,255,255,0.08);
        backdrop-filter:blur(6px);
        border:1px solid rgba(255,255,255,0.15);
        border-radius:14px;
        padding:1rem 1.5rem;
        margin-bottom:1.2rem;
        box-shadow:0 6px 20px -6px #0007;
        transition:transform .25s,box-shadow .25s;
    }
    .food-card:hover{
        transform:translateY(-4px) scale(1.02);
        box-shadow:0 8px 24px -6px #ffb347aa;
    }
    .food-card ul{list-style:none;padding-left:0;margin:0;}
    .food-card li{margin:0.25rem 0;}

    .prio{
        color:#000;padding:2px 8px;border-radius:12px;font-weight:700;
        display:inline-block;min-width:24px;text-align:center;
    }

    .stCheckbox { margin-bottom: 0.8rem !important; }
    .stCheckbox label {
        color: #fff !important;
        font-weight: 600 !important;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.5) !important;
        font-size: 1.05rem !important;
        cursor: pointer !important;
    }
    .stCheckbox input[type="checkbox"] {
        transform: scale(1.2) !important;
        margin-right: 0.5rem !important;
        accent-color: #ffb347 !important;
    }
    .stCheckbox div {
        background: rgba(255,255,255,0.08) !important;
        border-radius: 8px !important;
        padding: 0.5rem 0.8rem !important;
        transition: all 0.2s ease !important;
        border: 1px solid rgba(255,255,255,0.2) !important;
    }
    .stCheckbox div:hover {
        background: rgba(255,255,255,0.2) !important;
        transform: translateX(4px) !important;
        box-shadow:0 0 12px #ffb347aa;
    }

    .stRadio div[role="radiogroup"] {
        background: rgba(255,255,255,0.15) !important;
        backdrop-filter: blur(8px) !important;
        border: 1px solid rgba(255,255,255,0.3) !important;
        border-radius: 14px !important;
        padding: 1rem !important;
        box-shadow: 0 6px 20px -6px rgba(0,0,0,0.4) !important;
    }

    ::-webkit-scrollbar{width:10px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:#ffb347aa;border-radius:8px;}
    ::-webkit-scrollbar-thumb:hover{background:#ffb347;}

    body::before {
        content:"";
        position:fixed;
        top:0;left:0;width:100%;height:100%;
        background:url('https://assets9.lottiefiles.com/packages/lf20_8wwgm0v5.json');
        opacity:0.03;
        z-index:-1;
        pointer-events:none;
    }

    #lottie-container{
        position:fixed;top:.5rem;right:.5rem;width:160px;
        z-index:999;pointer-events:none;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# ─────────────────────────  CORNER HALLOWEEN LOTTIE  ────────────────────────────
st.markdown(
    """
    <div id="lottie-container">
      <script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
      <lottie-player autoplay loop speed="0.8"
                     src="https://assets2.lottiefiles.com/private_files/lf30_kvdn44jg.json">
      </lottie-player>
    </div>
    """,
    unsafe_allow_html=True,
)

# ──────────────────────────  DATA LOAD  ────────────────────────────────────────
SHEET_ID = "1RdbRqKf16xl57QhQau1UuLr4Hj2OEiy4etDsbLIF9fw"
CSV_URL  = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"

@st.cache_data(ttl=300)
def load_data() -> pd.DataFrame:
    """
    Load Disney Halloween Adventure data from Google Sheets CSV,
    ensuring numeric columns are properly cleaned and missing columns are handled.
    """
    try:
        r = requests.get(CSV_URL)
        r.raise_for_status()
    except requests.RequestException as e:
        st.error(f"Failed to load data: {e}")
        return pd.DataFrame()  # Return empty DataFrame on failure

    df = pd.read_csv(StringIO(r.content.decode("utf-8")))

    # ── Ensure numeric columns exist and are clean ─────────
    for col, default in [("Eats?", 1), ("Priority", 3)]:
        if col not in df.columns:
            df[col] = default
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(default).astype(int)

    # ── Ensure essential string columns exist ─────────────
    for col in ["Park", "Area", "Food", "Location"]:
        if col not in df.columns:
            df[col] = "Not listed"
        else:
            df[col] = df[col].fillna("Not listed")

    return df


df = load_data()
st.session_state.setdefault("just_refreshed", False)

# ──────────────────────────  HELPERS  ──────────────────────────────────────────
def prio_badge(p: int) -> str:
    palette = {1: "#ffdd57", 2: "#66e0ff", 3: "#ff7f7f"}
    return f"<span class='prio' style='background:{palette.get(p,'#999')}'>{p}</span>"

# ──────────────────────────  TABS  ─────────────────────────────────────────────
tab1, tab2 = st.tabs(["🍿 Disney Eats", "👻 Adventures"])

for tab, eats_value in zip([tab1, tab2], [1, 0]):
    with tab:
        st.title("🎃 Disney Eats 🎃" if eats_value == 1 else "🕯️ Adventures 🕯️")

        st.markdown('<div id="filter-box">', unsafe_allow_html=True)

        park = st.radio("Park 🎢", ["Disneyland", "California Adventure"], key=f"park_{eats_value}")
        data = df[(df["Park"].str.contains(park, case=False, na=False)) & (df["Eats?"] == eats_value)]

        areas = sorted(data["Area"].dropna().unique())

        if f"selected_areas_{eats_value}" not in st.session_state:
            st.session_state[f"selected_areas_{eats_value}"] = []

        st.markdown("### You're in ...")

        if len(areas) == 0:
            st.info("No areas found for this park yet — check back soon!")
        else:
            num_cols = min(3, len(areas)) if len(areas) > 0 else 1
            cols = st.columns(num_cols)

            for i, area in enumerate(areas):
                with cols[i % num_cols]:
                    checked = st.checkbox(
                        area,
                        value=area in st.session_state[f"selected_areas_{eats_value}"],
                        key=f"area_{area}_{eats_value}"
                    )
                    if checked and area not in st.session_state[f"selected_areas_{eats_value}"]:
                        st.session_state[f"selected_areas_{eats_value}"].append(area)
                    elif not checked and area in st.session_state[f"selected_areas_{eats_value}"]:
                        st.session_state[f"selected_areas_{eats_value}"].remove(area)

        st.markdown('</div>', unsafe_allow_html=True)

        # ────── APPLY FILTERS ─────────
        selected_areas = st.session_state[f"selected_areas_{eats_value}"]
        if not selected_areas:
            selected_areas = areas  # default to all areas if nothing selected

        data = data[data["Area"].isin(selected_areas)]
        data = data.sort_values("Priority")

        st.markdown(
            "## So you should try…" if eats_value == 1 else "## So you should explore…"
        )

        for _, row in data.iterrows():
            st.markdown(
                f"""
                <div class="food-card">
                  <h3>{row.get('Food', 'Unnamed Item')}</h3>
                  <ul>
                    <li><strong>Price:</strong> ${row.get('Price', 0):.2f}</li>
                    <li><strong>Location:</strong> {row.get('Location', 'Not listed')}</li>
                    <li><strong>Area:</strong> {row.get('Area', 'Not listed')}</li>
                    <li><strong>Priority:</strong> {prio_badge(int(row.get('Priority', 3)))}</li>
                  </ul>
                </div>
                """,
                unsafe_allow_html=True,
            )

# ─── One-time welcome animation ────────────────────────────────────────────────
if "welcome_shown" not in st.session_state:
    st.session_state.welcome_shown = False

if not st.session_state.welcome_shown:
    st.balloons()
    st.session_state.welcome_shown = True
