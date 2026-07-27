// The standing cue MapView shows while its click-to-place mode is armed, one
// per mode. They live together, away from either caller, because the map that
// renders them is a sibling of the form that arms them — so nothing owns both.
export const ORIGIN_PICK_CUE = 'Click the map to set origin — Esc to cancel'
export const STOP_PLACEMENT_CUE = 'Click the map to add a stop — Esc when done'
