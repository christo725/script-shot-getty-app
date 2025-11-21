# Getty Images Collection Filter Guide

## Overview
Your app now includes filters to search specific **Penske Media Collections** when searching Getty Images. You can select multiple collections simultaneously.

## How to Use

1. **Navigate to Step 3** - After generating your shotlist, you'll see collection filter checkboxes before the "Search Getty Images" button
2. **Select Collections** - Check/uncheck the collections you want to search:
   - **Billboard** (blb)
   - **WWD** (wom)
   - **Rolling Stone** (rol)
   - **Hollywood Reporter** (tho)
   - **Variety** (vrt)
3. **All are checked by default** - This searches across all Penske Media collections
4. **Click Search** - The search will be restricted to your selected collections
5. **Uncheck all** - If no collections are selected, searches will return results from all Getty editorial collections

## Technical Details

### Collection Codes
The filter uses the `collection_codes` parameter in the Getty Images API. The current collection codes are:

| Collection | Code |
|------------|------|
| Billboard | `blb` |
| WWD | `wom` |
| Rolling Stone | `rol` |
| Hollywood Reporter | `tho` |
| Variety | `vrt` |

### How to Update Collection Codes

If you need to add, remove, or change collection codes:

1. Open `/src/App.tsx`
2. Find the `COLLECTION_CODES` object (around line 80):
   ```typescript
   const COLLECTION_CODES = {
     billboard: 'blb',
     wwd: 'wom',
     rollingStone: 'rol',
     hollywoodReporter: 'tho',
     variety: 'vrt'
   };
   ```
3. Update the codes as needed
4. Also update the `collections` state initialization to match
5. Update the UI checkboxes in the JSX (search for "collection-checkbox-label")

### How It Works

When collections are selected:
- **Multiple codes**: The app combines selected codes into a comma-separated string
  - Example: `collection_codes=blb,wom,rol` (Billboard, WWD, Rolling Stone)
- **Videos**: Adds the collection_codes parameter to the video search API call
- **Photos**: Adds the collection_codes parameter to the image search API call
- **All selected**: By default, all 5 collections are searched: `collection_codes=blb,wom,rol,tho,vrt`

The proxy server (`server.js`) passes these parameters directly to the Getty API.

## Adding New Collections

If you need to add additional Penske Media collections:

1. **Get the collection code from Getty** - Contact Getty API support for the code
2. **Add to state** - Update the `collections` state object in `App.tsx`
3. **Add to codes** - Update the `COLLECTION_CODES` object
4. **Add UI checkbox** - Add a new checkbox in the JSX (copy existing format)
5. **Test** - Verify the new collection works by doing a search

## API Reference

Getty Images API Documentation on collection filtering:
- Base API: `https://api.gettyimages.com/v3`
- Videos endpoint: `/search/videos/editorial?collection_codes=CODE`
- Images endpoint: `/search/images/editorial?collection_codes=CODE`

For more information, visit: https://www.gettyimages.co.uk/api

## Troubleshooting

### No results returned when filters are enabled
- One or more collection codes might be incorrect
- Your API account might not have access to these collections
- Try unchecking all filters to search all editorial collections
- Check browser console for API error messages

### Filter doesn't seem to change results
- Check the browser console for API errors
- Verify the checkboxes are being properly toggled
- Check network tab to confirm the `collection_codes` parameter is being sent
- Look at the "Active filters" display below the checkboxes

### Want to search all collections
- Simply uncheck all collection checkboxes
- Or click "Deselect All"
- When no collections are selected, the app searches all Getty editorial collections

## Support
For Getty API-specific questions about collection codes and access, contact Getty Images API Support.

