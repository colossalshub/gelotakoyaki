import Link from "next/link";
import { formatPhp, formatQty, formatSignedQty } from "@/domain/format";
import { D } from "@/domain/decimal";

export function PageHeader({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-sm text-muted">{lede}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "bad" | "ok"; children: React.ReactNode }) {
  const toneClass = tone === "bad" ? "banner-bad" : tone === "ok" ? "banner-ok" : "";
  return (
    <div className={`banner mb-4 ${toneClass}`} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Empty({ title, body, href, label }: { title: string; body: string; href?: string; label?: string }) {
  return (
    <div className="card px-4 py-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {href && label ? (
        <Link className="btn btn-primary mt-4" href={href}>
          {label}
        </Link>
      ) : null}
    </div>
  );
}

export function QtyText({ value, unit }: { value: { toString(): string } | string; unit?: string }) {
  return (
    <span className="num">
      {formatQty(value)}
      {unit ? <span className="ml-1 text-muted">{unit}</span> : null}
    </span>
  );
}

export function SignedQty({ value, unit }: { value: { toString(): string }; unit?: string }) {
  const decimal = D(value);
  const color = decimal.isNeg() ? "text-danger" : decimal.isZero() ? "text-muted" : "text-ok";
  return (
    <span className={`num ${color}`}>
      {formatSignedQty(decimal)}
      {unit ? <span className="ml-1 text-muted">{unit}</span> : null}
    </span>
  );
}

export function Money({ value }: { value: { toString(): string } | null }) {
  if (!value) return <span className="text-muted">Cost unknown</span>;
  return <span className="num">{formatPhp(D(value))}</span>;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="pill">{children}</span>;
}

export function Filters({
  branches,
  branch,
  from,
  to,
}: {
  branches: Array<{ id: string; code: string; name: string }>;
  branch?: string;
  from?: string;
  to?: string;
}) {
  return (
    <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]" method="get">
      <label className="field">
        <span>Branch</span>
        <select className="control" name="branch" defaultValue={branch ?? ""}>
          <option value="">All authorised branches</option>
          {branches.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.code} · {entry.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>From</span>
        <input className="control" type="date" name="from" defaultValue={from ?? ""} />
      </label>
      <label className="field">
        <span>To</span>
        <input className="control" type="date" name="to" defaultValue={to ?? ""} />
      </label>
      <div className="flex items-end">
        <button className="btn w-full" type="submit">
          Apply
        </button>
      </div>
    </form>
  );
}
