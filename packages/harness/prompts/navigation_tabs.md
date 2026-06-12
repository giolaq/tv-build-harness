The template uses a drawer navigator — you MUST REPLACE it with a top tab bar.

IMPORTANT: Do NOT install @react-navigation/bottom-tabs or @react-navigation/material-top-tabs. These packages have version conflicts with the template's @react-navigation/native and WILL crash with "createScreenFactory is not a function".

Instead, implement tabs using the EXISTING drawer navigator infrastructure with a CUSTOM top tab bar:

Steps:
1. Keep the drawer navigator but set drawerType: 'permanent' and drawerStyle: { width: 0, height: 0 } (invisible drawer)
   OR replace the drawer with a simple Stack navigator that renders a custom top tab bar + screen content
2. Create a custom TopTabBar component at packages/shared-ui/src/components/TopTabBar.tsx:
   - Renders a horizontal row of tab items at the top of the screen
   - Each tab is a SpatialNavigationFocusableView (for D-pad navigation)
   - Active tab is highlighted with accent color
   - Use SpatialNavigationNode with orientation="horizontal" to wrap the tab row
   - Tab labels must be scaledPixels(22) minimum for TV readability
3. The TopTabBar receives the current route and an onTabPress callback
4. Wrap screens in a View with the TopTabBar at top and screen content below:
   <View style={{flex:1}}>
     <TopTabBar routes={routes} activeRoute={currentRoute} onTabPress={navigate} />
     <View style={{flex:1}}>{/* screen content */}</View>
   </View>
5. Remove the drawer-related imports, CustomDrawerContent component, and MenuContext/MenuProvider (not needed for tabs)
6. Remove any menu toggle buttons or hamburger icons
7. Since there is no drawer, screens do NOT need isMenuOpen — just use isActive={isFocused} with useIsFocused()
