import streamlit as st
import pandas as pd
import requests
from io import StringIO

# ──────────────────────────  PAGE CONFIG  ──────────────────────────────────────
st.set_page_config(page_title="Disney Eats", page_icon="🎡", layout="wide")

# ─────────────────────────  GLOBAL THEME / CSS  ────────────────────────────────
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Quicksand:wght@400;600&display=swap');

    /* --- animated gradient background --- */
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

    header[data-testid="stHeader"]{display:none;}

    #filter-box{position:sticky;top:.5rem;z-index:998;}

    .stRadio>label,.stSelectbox label{font-weight:600;font-size:1.05rem;color:#fffb;}

    h1,h2,h3{
        font-family:'Luckiest Guy',cursive;
        letter-spacing:1px;
        text-shadow:2px 2px 2px #0006;
    }

    /* --- glass-blur cards --- */
    .food-card{
        background:rgba(255,255,255,0.15);
        backdrop-filter:blur(6px);
        border:1px solid rgba(255,255,255,0.25);
        border-radius:14px;
        padding:1rem 1.5rem;
        margin-bottom:1.2rem;
        box-shadow:0 6px 20px -6px #0007;
        transition:transform .25s,box-shadow .25s;
    }
    .food-card:hover{
        transform:translateY(-4px) scale(1.02);
        box-shadow:0 8px 24px -6px #000a;
    }
    .food-card ul{list-style:none;padding-left:0;margin:0;}
    .food-card li{margin:0.25rem 0;}

    /* priority pill */
    .prio{
        color:#000;padding:2px 8px;border-radius:12px;font-weight:700;
        display:inline-block;min-width:24px;text-align:center;
    }

    /* Area filter container styling - removed since not using container box */
    
    /* Checkbox styling */
    .stCheckbox {
        margin-bottom: 0.8rem !important;
    }
    
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
        accent-color: #ff1361 !important;
    }
    
    .stCheckbox div {
        background: rgba(255,255,255,0.1) !important;
        border-radius: 8px !important;
        padding: 0.5rem 0.8rem !important;
        transition: all 0.2s ease !important;
        border: 1px solid rgba(255,255,255,0.2) !important;
    }
    
    .stCheckbox div:hover {
        background: rgba(255,255,255,0.2) !important;
        transform: translateX(4px) !important;
    }
    
    /* Radio button styling for glass effect */
    .stRadio div[role="radiogroup"] {
        background: rgba(255,255,255,0.25) !important;
        backdrop-filter: blur(8px) !important;
        border: 1px solid rgba(255,255,255,0.35) !important;
        border-radius: 14px !important;
        padding: 1rem !important;
        box-shadow: 0 6px 20px -6px rgba(0,0,0,0.3) !important;
    }
    
    .stRadio div[role="radiogroup"] label {
        color: #fff !important;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.5) !important;
        font-weight: 600 !important;
    }

    /* Expander styling - removed since we're not using it anymore */

    /* scrollbar */
    ::-webkit-scrollbar{width:10px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:#ff1361aa;border-radius:8px;}
    ::-webkit-scrollbar-thumb:hover{background:#ff1361;}

    /* corner Lottie */
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
    r = requests.get(CSV_URL); r.raise_for_status()
    return pd.read_csv(StringIO(r.content.decode("utf-8")))

df = load_data()

# make sure flag exists
st.session_state.setdefault("just_refreshed", False)

# ──────────────────────────  HELPERS  ──────────────────────────────────────────
def prio_badge(p:int)->str:
    palette={1:"#ffdd57",2:"#66e0ff",3:"#ff7f7f"}
    return f"<span class='prio' style='background:{palette.get(p,'#999')}'>{p}</span>"

# ──────────────────────────  UI CONTROLS  ──────────────────────────────────────
st.title("🍿Disney Eats🍿")

st.markdown('<div id="filter-box">', unsafe_allow_html=True)

park = st.radio("Park 🎢", ["Disneyland", "California Adventure"])
data = df[df["Park"].str.contains(park, case=False, na=False)]

areas = sorted(data["Area"].dropna().unique())

# Initialize session state for area filters
if "selected_areas" not in st.session_state:
    st.session_state.selected_areas = []  # Start with no areas selected

st.markdown("### You're in ...")

# Create columns for checkboxes
num_cols = min(3, len(areas))  # Max 3 columns
cols = st.columns(num_cols)

for i, area in enumerate(areas):
    with cols[i % num_cols]:
        checked = st.checkbox(
            area, 
            value=area in st.session_state.selected_areas,
            key=f"area_{area}"
        )
        if checked and area not in st.session_state.selected_areas:
            st.session_state.selected_areas.append(area)
        elif not checked and area in st.session_state.selected_areas:
            st.session_state.selected_areas.remove(area)
st.markdown('</div>', unsafe_allow_html=True)  # close sticky container

# Filter data based on selected areas
if st.session_state.selected_areas:
    data = data[data["Area"].isin(st.session_state.selected_areas)]
else:
    # If no areas selected, show empty dataframe
    data = data.iloc[0:0]

data = data.sort_values("Priority")

# ──────────────────────────  REFRESH BUTTON  ───────────────────────────────────
# if st.button("🔄 Refresh Menu"):
#     st.cache_data.clear()
#     st.session_state.just_refreshed = True
#     # use new stable API; fall back if user runs an old Streamlit
#     if hasattr(st, "rerun"):
#         st.rerun()
#     else:
#         st.experimental_rerun()   # legacy fallback

# ──────────────────────────  FOOD LIST  ────────────────────────────────────────
st.markdown("## So you should try…")

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

# ── One-time welcome balloons ────────────────────────────────────────────────
if "welcome_shown" not in st.session_state:
    st.session_state.welcome_shown = False

if not st.session_state.welcome_shown:
    st.balloons()
    st.session_state.welcome_shown = True