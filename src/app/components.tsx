import { useEffect, useRef, type ReactNode } from "react";
import { X, BriefcaseBusiness, ArrowUpRight } from "lucide-react";
import { safeUrl, type Status } from "../domain/model";
export function Chip({ status }: { status: Status }) {
  return (
    <span
      className={`chip status-${status.toLowerCase()}`}
      title={status === "OA" ? "Online assessment" : status}
    >
      {status}
    </span>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const valid = safeUrl(href);
  return valid ? (
    <a href={valid} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BriefcaseBusiness size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function formatDate(value: string) {
  return value
    ? new Date(
        value.length === 10 ? value + "T12:00:00" : value,
      ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}
