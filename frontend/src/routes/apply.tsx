import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { TopNav } from "@/components/vc/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type TraceItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { UploadCloud, FileText, X, CheckCircle2, Plus, Users, UserPlus, FileUser, Video, Loader2, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const fileToB64 = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(f);
});

const PIPELINE_STEPS = [
  "Screening application",
  "Extracting quote-anchored claims",
  "Enriching public footprint",
  "Founder Score & cold-start check",
  "Three-axis assessment (never averaged)",
  "Verifying claims — internal + web",
  "Writing the investment memo",
];

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Apply — Scopos" },
      { name: "description", content: "Submit your company to Scopos. 24-hour check decision timeline." },
    ],
  }),
  component: Apply,
});

type CofounderForm = { id: string; name: string; role: string; email: string; linkedin: string; github: string; cv: File | null };

const ROLES = ["CEO", "CTO", "COO", "CPO", "Other"];

function makeFounder(role = "CEO"): CofounderForm {
  return { id: crypto.randomUUID(), name: "", role, email: "", linkedin: "", github: "", cv: null };
}

function Apply() {
  const navigate = useNavigate();
  const { ready, signedIn } = useAuth();
  // The founder portal is public-only; signed-in partners belong in the dashboard.
  useEffect(() => {
    if (ready && signedIn) navigate({ to: "/command" });
  }, [ready, signedIn, navigate]);
  const [company, setCompany] = useState("");
  const [tagline, setTagline] = useState("");
  const [founders, setFounders] = useState<CofounderForm[]>([makeFounder("CEO")]);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [askUsd, setAskUsd] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [submitted, setSubmitted] = useState<null | { matched: string[]; newIds: string[]; company: string; dealId: string; artifacts: { label: string; note: string }[]; trace: TraceItem[] }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const deckInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!submitting) return;
    setProgressStep(0); setElapsed(0);
    const stepTimer = setInterval(() => setProgressStep((s) => Math.min(s + 1, PIPELINE_STEPS.length - 1)), 13000);
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { clearInterval(stepTimer); clearInterval(clock); };
  }, [submitting]);

  const addLink = () => {
    const v = linkDraft.trim();
    if (!v) return;
    setLinks([...links, v]);
    setLinkDraft("");
  };

  const updateFounder = (id: string, patch: Partial<CofounderForm>) => {
    setFounders((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const removeFounder = (id: string) => setFounders((prev) => prev.filter((f) => f.id !== id));
  const addFounder = () => setFounders((prev) => [...prev, makeFounder(prev.length === 0 ? "CEO" : "CTO")]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!company.trim()) { toast.error("Company name is required"); return; }
    if (!founders[0]?.name.trim()) { toast.error("At least one founder name is required"); return; }
    if (!deckFile) { toast.error("A pitch deck (PDF) is required — it is what the pipeline reads"); return; }
    setSubmitting(true);
    try {
      const deckB64 = await fileToB64(deckFile);
      // Real CV content: PDFs go up as base64 for server-side extraction; plain
      // text files are read directly.
      let cvFile: string | null = null;
      let cvText: string | null = null;
      const cv = founders.find((f) => f.cv)?.cv ?? null;
      if (cv) {
        if (/\.(txt|md)$/i.test(cv.name)) cvText = await cv.text();
        else cvFile = await fileToB64(cv);
      }
      const payload = {
        company, tagline: tagline || undefined,
        founders: founders.map((f) => ({ name: f.name, role: f.role, email: f.email, linkedin: f.linkedin || undefined, github: f.github || undefined })),
        links, hasDeck: true,
        deckFile: deckB64, cvFile, cvText,
        askUsd: askUsd ? parseInt(askUsd, 10) : undefined,
        videoPitch: videoUrl || null,
      };
      const res = await api.submitApplication(payload);
      const trace = await api.listTrace(res.dealId).catch(() => [] as TraceItem[]);
      const artifacts: { label: string; note: string }[] = [];
      if (deckFile) artifacts.push({ label: `Pitch deck · ${deckFile.name}`, note: "parsed server-side for quote-anchored claims" });
      if (cv) artifacts.push({ label: `CV · ${cv.name}`, note: cvText ? "text ingested" : "parsed server-side" });
      if (videoUrl) artifacts.push({ label: `Video pitch · ${shortUrl(videoUrl)}`, note: "link stored" });
      setSubmitted({ matched: res.matchedFounderIds, newIds: res.newFounderIds, company: company || "Your application", dealId: res.dealId, artifacts, trace });
      toast.success(`Application processed — ${res.newFounderIds.length} new founder${res.newFounderIds.length === 1 ? "" : "s"} created${res.matchedFounderIds.length ? `, ${res.matchedFounderIds.length} matched in memory` : ""}.`);
    } catch {
      toast.error("Could not submit application — is the backend running?");
    } finally {
      setSubmitting(false);
    }
  };

  const openInCommand = () => {
    if (!submitted) return;
    navigate({ to: "/command", search: { deal: submitted.dealId, tab: "overview" as const, claim: undefined, q: undefined } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-10">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Founder portal · public submission
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Submit your company.</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            We ask only what a 24-hour decision needs: your company, a founder, and a deck.
            Everything else is optional — we pull the rest from your public footprint.
          </p>
        </div>

        {submitting ? (
          <PipelineProgress step={progressStep} elapsed={elapsed} company={company} />
        ) : submitted ? (
          <ConfirmationBanner
            company={submitted.company}
            matched={submitted.matched}
            newIds={submitted.newIds}
            artifacts={submitted.artifacts}
            trace={submitted.trace}
            onOpen={openInCommand}
            onReset={() => {
              setSubmitted(null); setCompany(""); setTagline("");
              setFounders([makeFounder("CEO")]); setDeckFile(null); setVideoUrl(""); setLinks([]);
            }}
          />
        ) : (
          <form onSubmit={submit} className="space-y-8 rounded-2xl border border-border bg-card p-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Company name" required>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Labs" className="h-11 bg-surface-1" required />
              </Field>
              <Field label="One-line pitch">
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Deterministic runtime for multi-agent LLMs." className="h-11 bg-surface-1" />
              </Field>
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Founding team <span className="text-danger">*</span>
                  </Label>
                  <p className="mt-1 text-[11px] text-muted-foreground">Add each cofounder. We match by email against our Founder Memory — if we already know them, their history follows.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addFounder} className="gap-1">
                  <UserPlus className="h-3.5 w-3.5" /> Add cofounder
                </Button>
              </div>
              <div className="space-y-3">
                {founders.map((f, i) => (
                  <CofounderCard
                    key={f.id}
                    index={i}
                    founder={f}
                    onChange={(patch) => updateFounder(f.id, patch)}
                    onRemove={founders.length > 1 ? () => removeFounder(f.id) : undefined}
                  />
                ))}
              </div>
            </section>

            <Field label="Pitch deck (PDF)" required>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setDeckFile(f); }}
                onClick={() => deckInputRef.current?.click()}
                className={cn("group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
                  dragOver ? "border-foreground/50 bg-surface-2" : "border-border bg-surface-1 hover:border-foreground/30")}
              >
                <input ref={deckInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => setDeckFile(e.target.files?.[0] ?? null)} />
                {deckFile ? (
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-foreground" />
                    <div className="text-left">
                      <div className="text-sm font-medium">{deckFile.name}</div>
                      <div className="text-xs text-muted-foreground">{(deckFile.size / 1024).toFixed(0)} KB · Ready to ingest</div>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setDeckFile(null); }} className="ml-4 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="mb-3 h-8 w-8 text-muted-foreground group-hover:text-foreground" />
                    <p className="text-sm font-medium">Drop your deck here, or click to browse</p>
                    <p className="mt-1 text-xs text-muted-foreground">PDF, up to 25 MB. We never share your deck.</p>
                  </>
                )}
              </div>
            </Field>

            <Field label="Funding sought (USD)" hint="Optional — 'Not disclosed' if left blank">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <input
                  type="number" min="0" step="10000" value={askUsd}
                  onChange={(e) => setAskUsd(e.target.value)}
                  placeholder="150000"
                  className="flex-1 bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
            </Field>

            <Field label="Video pitch URL" hint="Optional — YouTube, Loom, Vimeo link">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-3">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://loom.com/share/…"
                    className="flex-1 bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground"
                  />
                  {videoUrl && (
                    <button type="button" onClick={() => setVideoUrl("")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
            </Field>

            <Field label="Supporting artifact links" hint="Optional — GitHub, product URL, docs">
              <div className="rounded-xl border border-border bg-surface-1 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {links.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs">
                      {l}
                      <button type="button" onClick={() => setLinks(links.filter((x) => x !== l))} className="text-muted-foreground hover:text-danger">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <div className="flex flex-1 items-center gap-1 min-w-[180px]">
                    <input
                      value={linkDraft}
                      onChange={(e) => setLinkDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                      placeholder="paste a URL and press Enter"
                      className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground"
                    />
                    {linkDraft && (
                      <button type="button" onClick={addLink} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Field>

            <div className="flex items-center justify-between border-t border-border pt-6">
              <p className="text-xs text-muted-foreground">By submitting, you agree to a one-way 24-hour review. The live pipeline runs on submit (≈60–120s).</p>
              <Button type="submit" size="lg" className="h-11 px-6" disabled={submitting}>
                Submit application
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function shortUrl(u: string) { try { return new URL(u).host + new URL(u).pathname.slice(0, 20); } catch { return u.slice(0, 40); } }

function PipelineProgress({ step, elapsed, company }: { step: number; elapsed: number; company: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-info" />
        <div>
          <h2 className="text-lg font-semibold">Running the live pipeline on {company || "your application"}…</h2>
          <p className="text-xs text-muted-foreground">Real LLM + verification calls — typically 60–120 seconds. Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>
        </div>
      </div>
      <ol className="mt-6 space-y-2.5">
        {PIPELINE_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            {i < step ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              : i === step ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
              : <span className="grid h-4 w-4 shrink-0 place-items-center"><span className="h-1.5 w-1.5 rounded-full bg-border" /></span>}
            <span className={cn(i < step ? "text-muted-foreground line-through decoration-border" : i === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[11px] text-muted-foreground">Progress markers are indicative — the exact per-step receipts appear once the pipeline completes.</p>
    </div>
  );
}

function CofounderCard({ index, founder, onChange, onRemove }: {
  index: number; founder: CofounderForm;
  onChange: (patch: Partial<CofounderForm>) => void;
  onRemove?: () => void;
}) {
  const cvInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Cofounder #{index + 1}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-danger">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Full name" value={founder.name} onChange={(e) => onChange({ name: e.target.value })} className="h-10 bg-surface-2" required />
        <select
          value={founder.role}
          onChange={(e) => onChange({ role: e.target.value })}
          className="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm"
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <Input type="email" placeholder="Email (optional — used to match Founder Memory)" value={founder.email} onChange={(e) => onChange({ email: e.target.value })} className="h-10 bg-surface-2 sm:col-span-2" />
        <Input placeholder="LinkedIn (optional)" value={founder.linkedin} onChange={(e) => onChange({ linkedin: e.target.value })} className="h-10 bg-surface-2" />
        <Input placeholder="GitHub (optional)" value={founder.github} onChange={(e) => onChange({ github: e.target.value })} className="h-10 bg-surface-2" />
        <div className="sm:col-span-2">
          <div
            onClick={() => cvInputRef.current?.click()}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2.5 hover:border-foreground/30"
          >
            <input
              ref={cvInputRef}
              type="file"
              accept="application/pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => onChange({ cv: e.target.files?.[0] ?? null })}
            />
            <FileUser className="h-4 w-4 text-muted-foreground" />
            {founder.cv ? (
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-medium">{founder.cv.name}</div>
                <div className="text-[10px] text-muted-foreground">CV / Resume · parsed server-side (footprint for cold-start founders)</div>
              </div>
            ) : (
              <div className="flex-1 text-xs text-muted-foreground">Attach CV / Resume (optional, PDF or TXT)</div>
            )}
            {founder.cv && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange({ cv: null }); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">
          {label} {required && <span className="text-danger">*</span>}
        </Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ConfirmationBanner({ onReset, onOpen, company, matched, newIds, artifacts, trace }: {
  onReset: () => void; onOpen: () => void; company: string; matched: string[]; newIds: string[];
  artifacts: { label: string; note: string }[]; trace: TraceItem[];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-success/40 bg-gradient-to-br from-success/10 via-card to-card p-10 ticker-fade-in">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success/20 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Application ingested into Memory Layer.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {company} is now visible in the Command Center under <em>Application Received</em>. The 24-hour check decision timeline has started.
          </p>
          {(matched.length > 0 || newIds.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {matched.length > 0 && (
                <div className="rounded-lg border border-info/40 bg-info/5 p-3 text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-info">Founder Memory match</div>
                  <p className="mt-1 text-foreground/90">
                    {matched.length} cofounder{matched.length > 1 ? "s were" : " was"} recognized. Long-term Founder Score follows them automatically.
                  </p>
                </div>
              )}
              {newIds.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-warning">New profiles created</div>
                  <p className="mt-1 text-foreground/90">
                    {newIds.length} new founder profile{newIds.length > 1 ? "s" : ""} added to Founder Memory.
                  </p>
                </div>
              )}
            </div>
          )}
          {artifacts.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-surface-1 p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Attached artifacts</div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {artifacts.map((a, i) => (
                  <li key={i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px]">
                    <span className="font-medium">{a.label}</span>
                    <span className="text-[10px] text-muted-foreground">· {a.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {trace.length > 0 && (
            <div className="mt-6 rounded-lg border border-border bg-surface-1 p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pipeline receipts — every step traced</div>
              <ol className="mt-2 space-y-1.5">
                {trace.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-foreground/90">{t.step}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{t.durationMs}ms</span>
                  </li>
                ))}
                {trace.length > 8 && <li className="text-[10px] text-muted-foreground">+{trace.length - 8} more in the deal's Receipts tab</li>}
              </ol>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={onOpen}>Open in Command Center →</Button>
            <Button variant="secondary" onClick={onReset}>Submit another</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
