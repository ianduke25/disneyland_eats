import streamlit as st
import pandas as pd
import requests
from io import StringIO

# Page config
st.set_page_config(page_title="Disney Food Finder", layout="wide")

# Google Sheets URL (using published CSV format for better emoji support)
SHEET_ID = "1RdbRqKf16xl57QhQau1UuLr4Hj2OEiy4etDsbLIF9fw"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv"

@st.cache_data(ttl=300)  # Cache for 5 minutes
def load_data():
    """Load data from Google Sheets"""
    response = requests.get(SHEET_URL)
    response.raise_for_status()
    response.encoding = 'utf-8'
    
    # Read CSV data with proper encoding
    csv_data = StringIO(response.text)
    df = pd.read_csv(csv_data)
    
    # Add 'Tried' column if it doesn't exist
    if 'Tried' not in df.columns:
        df['Tried'] = False
    
    return df

# Initialize session state for tried items
if 'tried_items' not in st.session_state:
    st.session_state.tried_items = set()

# Load data
df = load_data()

# Statistics banner at top
total_items = len(df)
tried_count = len([idx for idx in df.index if idx in st.session_state.tried_items])
completion_rate = (tried_count / total_items) * 100 if total_items > 0 else 0

col1, col2, col3 = st.columns(3)
with col1:
    st.metric("Total Items", total_items)
with col2:
    st.metric("Items Tried", tried_count)
with col3:
    st.metric("Completion Rate", f"{completion_rate:.1f}%")

st.markdown("---")

# Park toggle
page = st.radio("Select Park", ["Disneyland", "California Adventure"])

# Filter dataset by park
def filter_park(df, park):
    return df[df['Park'].str.contains(park, case=False, na=False)]

filtered_df = filter_park(df, page)

# Filter options
areas = sorted(filtered_df['Area'].dropna().unique())
priorities = sorted(filtered_df['Priority'].unique())

# Display filters in collapsible box (good for mobile)
with st.expander("🎯 Filter by Area and Priority", expanded=False):
    col1, col2 = st.columns(2)
    with col1:
        selected_area = st.selectbox("Select Area", ["All"] + list(areas))
    with col2:
        selected_priority = st.selectbox("Select Priority", ["All"] + [str(p) for p in priorities])

# Apply filters
if selected_area != "All":
    filtered_df = filtered_df[filtered_df['Area'] == selected_area]
if selected_priority != "All":
    filtered_df = filtered_df[filtered_df['Priority'] == int(selected_priority)]

# Sort by price ascending
filtered_df = filtered_df.sort_values(by="Price")

# Display results
st.title(f"🍽️ {page} Eats")

# Add refresh and reset buttons
col1, col2 = st.columns(2)
with col1:
    if st.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()
with col2:
    if st.button("Reset All Progress"):
        st.session_state.tried_items.clear()
        st.success("Progress reset!")
        st.rerun()

# Display food items
for idx, row in filtered_df.iterrows():
    with st.container():
        # Create columns for layout
        col1, col2 = st.columns([4, 1])
        
        with col1:
            # Check if item is marked as tried
            is_tried = idx in st.session_state.tried_items or row.get('Tried', False)
            
            if is_tried:
                st.markdown(f"### {row['Food'] or '*Unnamed Item*'} ✅ **Tried!**")
            else:
                st.markdown(f"### {row['Food'] or '*Unnamed Item*'}")
            
            st.markdown(f"- 💵 **Price**: ${row['Price']:.2f}")
            st.markdown(f"- 📍 **Location**: {row['Location'] or '*Not listed*'}")
            st.markdown(f"- 🗺️ **Area**: {row['Area'] or '*Not listed*'}")
            st.markdown(f"- 🔢 **Priority**: {row['Priority']}")
        
        with col2:
            # Mark as tried button
            if not is_tried:
                if st.button("Mark as Tried", key=f"try_{idx}", type="primary"):
                    st.session_state.tried_items.add(idx)
                    st.success(f"Marked '{row['Food']}' as tried!")
                    st.rerun()
            else:
                if st.button("Unmark", key=f"untry_{idx}", type="secondary"):
                    st.session_state.tried_items.discard(idx)
                    st.rerun()
        
        st.markdown("---")