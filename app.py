import streamlit as st
import pandas as pd
import requests
from io import StringIO

# ──────────────────────────  PAGE CONFIG  ──────────────────────────────────────
st.set_page_config(
    page_title="Disneyland Eats :p",
    page_icon="🎡",
    layout="wide",
)

# ─────────────────────────  GLOBAL CSS / THEMING  ──────────────────────────────
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Quicksand:wght@400;600&display=swap');

    /* Slow animated gradient (60 s) */
    html,body,[data-testid="stApp"]{
        height:100%;
        background:linear-gradient(-45deg,#231557,#44107a,#ff1361,#fff800);
        background-size:400% 400%;
        animation:gradientMove 60s ease infinite;
        font-family:'Quicksand',sans-serif;
        color:#fff;
    }
    @keyframes gradientMove{
        0%{background-position:0% 50%;}
        50%{background-position:100% 50%;}
        100%{background-position:0% 50%;}
    }

    header[data-testid="stHeader"]{display:none;}         /* hide default header */

    #filter-box{position:sticky;top:0.5rem;z-index:998;}  /* sticky controls */

    .stRadio>label,.stSelectbox label{
        font-weight:600;font-size:1.05rem;color:#fffb;
    }

    h1,h2,h3{
        font-family:'Luckiest Guy',cursive;
        letter-spacing:1px;
        text-shadow:2px 2px 2px #0006;
    }

    .food-card{
        background:rgba(255,255,255,0.15);
        backdrop-filter:blur(6px);
        border:1px solid rgba(255,255,255,0.25);
        border-radius:14px;
        padding:1rem 1.5rem;
        margin-bottom:1.2rem;
        box-shadow:0 6px 20px -6px #0007;
        transition:transform .25s, box-shadow .25s;
    }
    .food-card:hover{
        transform:translateY(-4px) scale(1.02);
        box-shadow:0 8px 24px -6px #000a;
    }

    .food-card ul{list-style:none;padding-left:0;margin:0;}
    .food-card li{margin:0.25rem 0;}

    .prio{
        color:#000;font-weight:700;padding:2px 8px;border-radius:12px;
        display:inline-block;min-width:24px;text-align:center;
    }

    ::-webkit-scrollbar{width:10px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:#ff1361aa;border-radius:8px;}
    ::-webkit-scrollbar-thumb:hover{background:#ff1361;}

    #lottie-container{
        position:fixed;top:.5rem;right:.5rem;width:160px;
        z-index:999;pointer-events:none;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# ─────────────────────────  CORNER BALLOON LOTTIE  ────────────────────────────
st.markdown(
    """
    <div id="lottie-container">
      <script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
      <lottie-player autoplay loop speed="1.1"
                     src="https://assets9.lottiefiles.com/packages/lf20_x3a8nrs8.json">
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
    resp = requests.get(CSV_URL)
    resp.raise_for_status()
    return pd.read_csv(StringIO(resp.content.decode("utf-8")))

df = load_data()

# Ensure flag exists
if "just_refreshed" not in st.session_state:
    st.session_state.just_refreshed = False

# ──────────────────────────  HELPER: PRIORITY BADGE  ───────────────────────────
def prio_badge(p: int) -> str:
    palette = {1: "#ffdd57", 2: "#66e0ff", 3: "#ff7f7f"}  # customise colours
    return f"<span class='prio' style='background:{palette.get(p, '#999')}'>{p}</span>"

# ──────────────────────────  UI CONTROLS  ──────────────────────────────────────
st.title("🍿 Disney Eats 🍿")

st.markdown('<div id="filter-box">', unsafe_allow_html=True)

park = st.radio("Park 🎢", ["Disneyland", "California Adventure"])
data = df[df["Park"].str.contains(park, case=False, na=False)]

areas      = sorted(data["Area"].dropna().unique())
priorities = sorted(data["Priority"].unique())

with st.expander("🎯 Filter by Area & Priority"):
    c1, c2 = st.columns(2)
    with c1:
        area = st.selectbox("Area", ["All"] + areas)
    with c2:
        prio = st.selectbox("Priority", ["All"] + [str(p) for p in priorities])

st.markdown('</div>', unsafe_allow_html=True)  # close sticky container

if area != "All":
    data = data[data["Area"] == area]
if prio != "All":
    data = data[data["Priority"] == int(prio)]

data = data.sort_values("Price")

# ──────────────────────────  REFRESH BUTTON + CONFETTI  ────────────────────────
if st.button("🔄 Refresh Menu"):
    st.cache_data.clear()
    st.session_state.just_refreshed = True
    st.experimental_rerun()

# ──────────────────────────  FOOD LIST  ────────────────────────────────────────
st.markdown("## To Try…")

for _, row in data.iterrows():
    st.markdown(
        f"""
        <div class="food-card">
          <h3>{row['Food'] or 'Unnamed Item'}</h3>
          <ul>
            <li><strong>Price:</strong> ${row['Price']:.2f}</li>
            <li><strong>Location:</strong> {row['Location'] or 'Not listed'}</li>
            <li><strong>Area:</strong> {row['Area'] or 'Not listed'}</li>
            <li><strong>Priority:</strong> {prio_badge(row['Priority'])}</li>
          </ul>
        </div>
        """,
        unsafe_allow_html=True,
    )

# ──────────────────────────  ONE-TIME BALLOONS AFTER REFRESH  ──────────────────
if st.session_state.just_refreshed:
    st.balloons()
    st.session_state.just_refreshed = False
