import streamlit as st
import pandas as pd

# Sample data
data = [
    ["🫔 Breakfast Chimichanga", 7.49, "Breakfast", "Ship to Shore Marketplace", "Frontierland", "Disneyland", 1],
    ["🫓  fried Fried Pickle Chips (NOT SPEARS)", 5.79, "Snack", "Smokejumpers Grill", "Buena Vista Street / Grizzly Peak", "California Adventure", 1],
    ["🍿 Popcorn Bucket", 14.25, "Snack", "", "", "Disneyland / California Adventure", 1],
    ["🍪 Chocolate Chip Cookies", 6.79, "Snack", "Harbour Gallery", "New Orleans Square", "Disneyland", 1],
    ["Churro", 5.75, "Snack", "", "", "Disneyland / California Adventure", 1],
    ["🍍 Pineapple Upside Down Sundae", 8.49, "Snack", "Tropical Hideaway", "Adventureland", "Disneyland", 1],
    ["🥖 Cheesy Garlic Pretzel Bread", 7.99, "Snack", "Edelweiss Snacks", "Fantasyland", "Disneyland", 1],
    ["☕️ Black Caf Cold Brew", 7.29, "Drink", "Docking Bay 7", "Star Wars: Galaxy's Edge", "Disneyland", 1],
    ["🍹 Secret Menu Cocktails", 15.00, "Drink", "Lamplight Lounge", "Pixar Pier", "California Adventure", 1],
    ["🍟 Space Place Cottage Fries", 9.49, "Snack", "Galactic Grill", "Tomorrowland", "Disneyland", 1],
    ["🌯 Soyrizo Breakfast Burrito", 10.99, "Breakfast", "Galactic Grill", "Tomorrowland", "Disneyland", 2],
    ["🥨 Cream Cheese Jalapeno Pretzel", 7.5, "Snack", "Cart near Star Tours", "Tomorrowland", "Disneyland", 2],
    ["🥕 Rontoless Garden Wrap", 14.49, "Lunch", "Ronto Roasters", "Star Wars: Galaxy's Edge", "Disneyland", 2],
    ["🍨 Dole Whip", 6.49, "Snack", "Tropical Hideaway", "Adventureland", "Disneyland", 2],
    ["🥤 Mint Julep", 6.49, "Drink", "Mint Julep Bar", "New Orleans Square", "Disneyland", 2],
    ["🍩 Mickey Beignets", 6.99, "Snack", "Mint Julep Bar", "New Orleans Square", "Disneyland", 2],
    ["🍑 Peach Cobbler Funnel Cake Fries", 9.99, "Snack", "Hungry Bear Jamboree", "Bayou Country", "Disneyland", 2],
    ["🍌 Banana Split Churro", 7.5, "Snack", "Churro Cart near Goofys Sky School", "Paradise Gardens Park", "California Adventure", 2],
    ["🥒  Pickle", 4.49, "Snack", "", "", "Disneyland", 3],
    ["🍲 Corn Soup", 12.99, "Lunch", "Harbour Gallery", "New Orleans Square", "Disneyland", 3],
    ["🥟 Ithorian Garden Patty Bun", 10.99, "Lunch", "Docking Bay 7", "Star Wars: Galaxy's Edge", "Disneyland", 3],
    ["⛰️ Celebration Matterhorn Macaroon", 8.29, "Snack", "Jolly Holliday", "Main Street", "Disneyland", 3],
]

columns = ["Food", "Price", "Category", "Location", "Area", "Park", "Priority"]
df = pd.DataFrame(data, columns=columns)

# Page config
st.set_page_config(page_title="Disney Food Finder", layout="wide")

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
    selected_area = st.selectbox("Select Area", ["All"] + areas)
    selected_priority = st.selectbox("Select Priority", ["All"] + [str(p) for p in priorities])

# Apply filters
if selected_area != "All":
    filtered_df = filtered_df[filtered_df['Area'] == selected_area]
if selected_priority != "All":
    filtered_df = filtered_df[filtered_df['Priority'] == int(selected_priority)]

# Sort by price ascending
filtered_df = filtered_df.sort_values(by="Price")

# Display results
st.title(f"🍽️ {page} Eats :p")
for _, row in filtered_df.iterrows():
    with st.container():
        st.markdown(f"### {row['Food'] or '*Unnamed Item*'}")
        st.markdown(f"- 💵 **Price**: ${row['Price']:.2f}")
        st.markdown(f"- 📍 **Location**: {row['Location'] or '*Not listed*'}")
        st.markdown(f"- 🗺️ **Area**: {row['Area'] or '*Not listed*'}")
        st.markdown(f"- 🔢 **Priority**: {row['Priority']}")
        st.markdown("---")
