// Kısa bildirim balonu ("Kaydedildi" vb.)
export const toast = $state<{ msg: string | null }>({ msg: null });
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string): void {
  toast.msg = msg;
  clearTimeout(timer);
  timer = setTimeout(() => (toast.msg = null), 2200);
}
