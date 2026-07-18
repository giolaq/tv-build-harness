export type FocusState = { focusedId: string | null; restoreId: string | null };

export const initialFocusState: FocusState = { focusedId: null, restoreId: null };

export function focusItem(state: FocusState, id: string): FocusState {
  return { ...state, focusedId: id };
}

export function openFrom(state: FocusState, id: string): FocusState {
  return { focusedId: id, restoreId: id };
}

export function preferredFocus(state: FocusState, id: string, fallback: string): boolean {
  return state.restoreId ? state.restoreId === id : id === fallback;
}
