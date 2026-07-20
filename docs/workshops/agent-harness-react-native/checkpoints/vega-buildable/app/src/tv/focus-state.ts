export type FocusState = { focusedId: string | null; restoreId: string | null };

export const initialFocusState: FocusState = { focusedId: null, restoreId: null };

export function focusItem(state: FocusState, id: string): FocusState {
  return { ...state, focusedId: id };
}

export function openFrom(state: FocusState, id: string): FocusState {
  return { focusedId: id, restoreId: id };
}

export function heroPreferredFocus(state: FocusState): boolean {
  return state.restoreId === null;
}

export function preferredFocus(state: FocusState, id: string): boolean {
  return state.restoreId === id;
}

export function moveIndex(index: number, direction: -1 | 1, itemCount: number): number {
  return Math.max(0, Math.min(itemCount - 1, index + direction));
}
