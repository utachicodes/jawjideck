# All Parameters

The All Parameters tab is the expert-level interface for viewing and editing every parameter on your flight controller. It provides search, filtering, file operations, and comparison tools.

## Parameter Table

All parameters are displayed in a sortable, searchable table:

| Column | Description |
|--------|-------------|
| Name | Parameter ID (click column header to sort) |
| Value | Current value (click to edit inline) |
| Modified | Badge shown if value differs from what's on the FC |
| Favourite | Star icon to mark parameters for quick access |
| Description | Parameter description from metadata |

Click any column header to sort. Click the same header again to reverse sort direction.

![TODO: screenshot of all parameters tab]()

## Search and Filter

- **Search box** -- Type a parameter name or keyword to filter the list in real time
- **Group tabs** -- Filter by category: All, Arming, Battery, Failsafe, Flight Modes, Tuning, GPS, Compass, RC, Motors, Navigation, Logging
- **Show Only Modified** -- Toggle to see only parameters you've changed
- **Show Only Favourites** -- Toggle to see only starred parameters

## Editing Parameters

Click a parameter value to edit it inline. The editor validates your input against min/max bounds and shows an error if the value is out of range.

For **bitmask parameters** (like arming checks or logging options), a modal editor opens showing individual flag checkboxes instead of a raw number.

Press Enter to confirm, Escape to cancel. Modified values are highlighted and a revert button appears to undo individual changes.

## File Operations

### Save Parameters

Save parameters to a `.param` file. Two options:
- **All Parameters** -- Exports every parameter
- **Changed Parameters Only** -- Exports only parameters you've modified

### Load Parameters from File

Load a `.param` file and compare it against the current FC values. A **Compare** dialog opens showing:

- A diff table with current and file values side by side
- Checkboxes to select which parameters to apply
- Select All / Deselect All buttons
- An Apply button for the selected parameters

After applying, ArduDeck writes the values to flash. If parameters require a reboot, ArduDeck runs an automatic reboot cycle (up to 3 cycles) to ensure all values take effect. A summary shows how many parameters were applied, failed, or still pending.

## Parameter History

ArduDeck auto-checkpoints your parameters before every write to flash. The **History** button in the configuration header shows all checkpoints with timestamps. You can restore any previous checkpoint to roll back changes.

Per-parameter history is also available by clicking the history icon on individual rows.

## Tips

- Use **favourites** to bookmark parameters you adjust frequently
- The **Modified** filter is useful before saving -- it shows exactly what you've changed
- When loading from a file, always review the diff before applying. Some parameters may not apply to your board
- Bitmask parameters are much easier to edit with the checkbox modal than by calculating raw values