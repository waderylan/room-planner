export type ToastVariant = "info" | "success" | "error";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}
