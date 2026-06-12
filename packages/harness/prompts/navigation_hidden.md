The template uses a drawer navigator — you MUST REMOVE visible navigation chrome.

Steps for hidden navigation:
1. Find the DrawerNavigator file
2. Replace it with a simple Stack navigator (no visible tabs or drawer)
3. The user navigates between screens via content interaction only (tapping tiles navigates to detail/player)
4. Keep a root stack with all screens registered, but no visible navigation bar
5. Remove drawer toggle buttons, hamburger icons, and the CustomDrawerContent component
6. The home screen is the entry point — other screens are reached by selecting content items
