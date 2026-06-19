"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  CircleDollarSign,
  Droplets,
  Layers3,
  MessageCircle,
  PaintBucket,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  SwatchBook,
  Upload,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { useState, useTransition } from "react";
import { runAIWizardAction } from "@/app/actions";

type Icon = typeof Sparkles;
type Question = {
  key: string;
  label: string;
  helper?: string;
  placeholder?: string;
  options?: string[];
};
type Tool = {
  type: "product_finder" | "color_consultant" | "problem_solver" | "system_recommender" | "budget_guidance" | "shade_match";
  title: string;
  shortTitle: string;
  promise: string;
  icon: Icon;
  accent: string;
  questions: Question[];
};

const tools: Tool[] = [
  {
    type: "product_finder",
    title: "AI Product Finder",
    shortTitle: "Product finder",
    promise: "Match your surface, condition, finish, and climate to a real paint system.",
    icon: PaintBucket,
    accent: "#A55337",
    questions: [
      { key: "surface", label: "What are you painting?", options: ["Interior walls", "Exterior walls", "Wood", "Metal", "Roof", "Damp area", "Feature wall"] },
      { key: "paint cycle", label: "Is this fresh paint or a repaint?", options: ["Fresh paint", "Repaint"] },
      { key: "condition", label: "What condition is the surface in?", options: ["Smooth", "Rough", "Damp", "Seepage", "Cracked", "Stained", "Faded", "Fungus", "Chalking"] },
      { key: "finish", label: "What finish do you prefer?", options: ["Matt", "Silk", "Gloss", "Texture", "Not sure"] },
      { key: "space", label: "Which space is this for?", options: ["Living room", "Bedroom", "Kids room", "Kitchen", "Bathroom", "Exterior", "Office", "Commercial"] },
      { key: "budget", label: "Choose a budget direction", options: ["Economy", "Standard", "Premium", "Long-term durability"] },
      { key: "washable", label: "Do you need a washable or stain-resistant finish?", options: ["Yes", "No", "Not sure"] },
      { key: "weather", label: "What city or weather conditions should we consider?", placeholder: "For example: Karachi, humid and coastal" },
      { key: "area", label: "Approximately how many square feet?", placeholder: "For example: 650 sqft" },
    ],
  },
  {
    type: "color_consultant",
    title: "AI Color Palette Consultant",
    shortTitle: "Color consultant",
    promise: "Create safe, premium, and bold palettes using only real catalogue shades.",
    icon: Palette,
    accent: "#9C775E",
    questions: [
      { key: "room", label: "Which room or space are we styling?", placeholder: "Living room, bedroom, office…" },
      { key: "furniture", label: "What colors are in the furniture?", placeholder: "Walnut wood, cream sofa, black accents…" },
      { key: "floor", label: "Describe the flooring", placeholder: "Warm beige tile, grey marble, dark wood…" },
      { key: "light", label: "How is the room lit?", options: ["Bright daylight", "Low light", "Warm artificial", "Cool artificial"] },
      { key: "mood", label: "How should the room feel?", options: ["Calm", "Luxury", "Cozy", "Energetic", "Modern", "Spacious", "Elegant"] },
      { key: "preferred family", label: "Any preferred color family?", placeholder: "Warm neutrals, sage greens, dusty blues…" },
      { key: "avoid colors", label: "Any colors you want to avoid?", placeholder: "Optional" },
      { key: "style", label: "Choose the closest style", options: ["Modern", "Classic", "Minimal", "Pakistani traditional", "Luxury", "Commercial"] },
      { key: "traffic", label: "Will kids, pets, or high traffic affect the room?", options: ["Yes", "No"] },
      { key: "product", label: "Any preferred product or finish?", placeholder: "Optional" },
    ],
  },
  {
    type: "problem_solver",
    title: "AI Wall Problem / Seepage Solver",
    shortTitle: "Problem solver",
    promise: "Understand likely causes, urgency, preparation, and a database-backed product system.",
    icon: Droplets,
    accent: "#487A79",
    questions: [
      { key: "problem", label: "What problem can you see?", options: ["Dampness", "Seepage", "Peeling", "Flaking", "Cracks", "Fungus", "Stains", "Fading", "Chalking", "Salt crystals / shora"] },
      { key: "scope", label: "Is the wall interior or exterior?", options: ["Interior", "Exterior"] },
      { key: "paint age", label: "How old is the existing paint?", placeholder: "For example: around 3 years" },
      { key: "active water", label: "Is there active water leakage?", options: ["Yes", "No", "Not sure"] },
      { key: "new plaster", label: "Is the wall newly plastered?", options: ["Yes", "No"] },
      { key: "powdery", label: "Is the surface powdery or flaky?", options: ["Yes", "No"] },
      { key: "problem photo", label: "Add a problem photo (optional)", helper: "A photo is supporting context only; active leaks and severe damp still need an on-site inspection." },
      { key: "weather", label: "What city or weather should we consider?", placeholder: "For example: Lahore, monsoon exposure" },
      { key: "budget", label: "Choose a repair budget direction", options: ["Economy", "Standard", "Premium"] },
      { key: "site visit", label: "Would you like a site inspection?", options: ["Yes", "No"] },
    ],
  },
  {
    type: "system_recommender",
    title: "AI Paint System Recommender",
    shortTitle: "System builder",
    promise: "Build the complete preparation, putty, primer, topcoat, and maintenance stack.",
    icon: Layers3,
    accent: "#56664D",
    questions: [
      { key: "surface", label: "What surface are you coating?", placeholder: "New plaster, old painted wall, wood, metal…" },
      { key: "paint cycle", label: "Fresh paint or repaint?", options: ["Fresh paint", "Repaint"] },
      { key: "condition", label: "Describe the surface condition", placeholder: "Smooth, cracked, chalky, damp, stained…" },
      { key: "scope", label: "Interior or exterior?", options: ["Interior", "Exterior"] },
      { key: "durability", label: "How much durability do you need?", options: ["Standard", "High", "Maximum"] },
      { key: "finish", label: "Preferred final finish", options: ["Matt", "Silk", "Gloss", "Texture", "Not sure"] },
      { key: "budget", label: "Choose a budget direction", options: ["Economy", "Standard", "Premium"] },
    ],
  },
  {
    type: "budget_guidance",
    title: "AI Budget Guidance",
    shortTitle: "Budget guide",
    promise: "Estimate litres, practical pack combinations, and catalogue-based cost direction.",
    icon: CircleDollarSign,
    accent: "#AD873C",
    questions: [
      { key: "project", label: "What kind of project is this?", placeholder: "Apartment repaint, exterior refresh, new house…" },
      { key: "area", label: "What is the estimated paintable area?", placeholder: "For example: 1,200 sqft" },
      { key: "budget", label: "Choose a budget level", options: ["Economy", "Standard", "Premium"] },
      { key: "city", label: "Which city is the project in?", placeholder: "City" },
      { key: "preference", label: "Any product or finish preference?", placeholder: "Washable matt, weather resistant…" },
      { key: "paint cycle", label: "Fresh paint or repaint?", options: ["Fresh paint", "Repaint"] },
      { key: "rooms", label: "How many rooms or areas?", placeholder: "For example: 4 rooms" },
    ],
  },
  {
    type: "shade_match",
    title: "AI Shade Match Helper",
    shortTitle: "Shade match",
    promise: "Translate a color description into the closest real shades and a coordinated palette.",
    icon: WandSparkles,
    accent: "#765E89",
    questions: [
      { key: "target color", label: "Describe the color you want to match", helper: "Mention a familiar object, material, hex value, or paint mood.", placeholder: "Dusty olive like an old ceramic vase…" },
      { key: "mood", label: "What mood should it create?", options: ["Calm", "Warm", "Fresh", "Dramatic", "Elegant", "Earthy", "Playful"] },
      { key: "room", label: "Where will this shade be used?", placeholder: "Bedroom, exterior, feature wall…" },
      { key: "light", label: "What is the lighting like?", options: ["Bright daylight", "Low light", "Warm artificial", "Cool artificial"] },
      { key: "product", label: "Any preferred paint product or finish?", placeholder: "Optional" },
      { key: "reference image", label: "Reference image", helper: "Image colour analysis is not enabled yet. Describe the image or paste a hex value for a catalogue-grounded text match.", placeholder: "Optional description or hex value" },
    ],
  },
];

type WizardResult = Record<string, unknown> & {
  sessionId?: string;
  leadId?: string | null;
  headline?: string;
  summary?: string;
  reason?: string;
  warning?: string;
  severity?: string;
  recommendedFinish?: string;
  provider?: string;
  providerUsed?: string;
  fallbackUsed?: boolean;
  products?: ProductResult[];
  shades?: ShadeResult[];
  palettes?: PaletteResult[];
  system?: string[];
  nextSteps?: string[];
  quantity?: { areaSqft?: number; liters?: number; packs?: number[]; estimatedCost?: number };
};
type ProductResult = {
  id: string;
  slug: string;
  name: string;
  finish: string;
  shortDescription: string;
  bucketImageUrl?: string | null;
  category: string;
  coverage: number;
  packSizes: unknown;
  currency?: string;
  startingPrice?: number | null;
  role: string;
};
type ShadeResult = {
  id: string;
  slug: string;
  name: string;
  code: string;
  hex: string;
  family: string;
  mood: string;
};
type PaletteResult = {
  name: string;
  mainShadeCode: string;
  accentShadeCode: string;
  trimShadeCode: string;
  productSlug: string;
  finish: string;
  reason: string;
};

function WizardCard({ tool, index, onPick }: { tool: Tool; index: number; onPick: () => void }) {
  const ToolIcon = tool.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ y: -7 }}
      onClick={onPick}
      className="group relative min-h-80 overflow-hidden border border-black/10 bg-[var(--surface)] p-7 text-left shadow-[0_18px_60px_rgba(18,31,25,.04)] transition-shadow hover:shadow-[0_24px_80px_rgba(18,31,25,.14)]"
    >
      <span className="absolute -right-10 -top-10 size-36 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150" style={{ background: tool.accent }} />
      <span className="grid size-12 place-items-center rounded-full text-white" style={{ background: tool.accent }}><ToolIcon size={22} /></span>
      <span className="mt-14 block text-[10px] font-black uppercase tracking-[.18em] text-[var(--muted)]">0{index + 1} · guided advisor</span>
      <h2 className="mt-3 font-serif text-4xl leading-none">{tool.title}</h2>
      <p className="mt-5 max-w-sm text-sm leading-6 text-[var(--muted)]">{tool.promise}</p>
      <span className="mt-8 flex items-center gap-2 text-xs font-black uppercase tracking-widest">Start wizard <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></span>
    </motion.button>
  );
}

export function AIWizardsExperience({ clientSlug, base, initialType }: { clientSlug: string; base: string; initialType?: Tool["type"] }) {
  const [active, setActive] = useState<Tool | null>(() => tools.find((tool) => tool.type === initialType) || null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [includeContact, setIncludeContact] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "", email: "", city: "" });
  const [result, setResult] = useState<WizardResult | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const chooseTool = (tool: Tool) => {
    setActive(tool);
    setStep(0);
    setAnswers({});
    setContact({ name: "", phone: "", email: "", city: "" });
    setIncludeContact(false);
    setResult(null);
    setError("");
  };
  const reset = () => {
    if (active) chooseTool(active);
  };
  const question = active?.questions[step];
  const answer = question ? answers[question.key] || "" : "";
  const progress = active ? ((step + 1) / active.questions.length) * 100 : 0;
  const canContinue = Boolean(answer.trim()) || ["avoid colors", "product", "reference image", "problem photo"].includes(question?.key || "");

  const finish = () => {
    if (!active) return;
    if (includeContact && (!contact.name.trim() || !contact.phone.trim())) {
      setError("Add your name and phone, or turn off the advisor follow-up option.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const output = await runAIWizardAction({
          clientSlug,
          type: active.type,
          answers,
          contact: includeContact ? contact : undefined,
        });
        setResult(output as WizardResult);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We could not create the recommendation. Please try again.");
      }
    });
  };

  if (!active) {
    return (
      <div>
        <div className="mb-10 grid gap-6 border-y border-black/10 py-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <span className="public-eyebrow"><Sparkles size={13} /> Six catalogue-grounded advisors</span>
            <h2 className="mt-5 max-w-4xl font-serif text-5xl leading-none md:text-6xl">Start with the question that is slowing your project down.</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-bold text-[var(--muted)]">
            <span className="flex items-center gap-2"><ShieldCheck size={16} /> Real products</span>
            <span className="flex items-center gap-2"><SwatchBook size={16} /> Real shades</span>
            <span className="flex items-center gap-2"><Check size={16} /> Saved sessions</span>
            <span className="flex items-center gap-2"><Sparkles size={16} /> Reliable fallback</span>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool, index) => <WizardCard key={tool.type} tool={tool} index={index} onPick={() => chooseTool(tool)} />)}
        </div>
      </div>
    );
  }

  const ActiveIcon = active.icon;
  return (
    <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
      <aside className="h-fit lg:sticky lg:top-28">
        <button onClick={() => setActive(null)} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--accent)]"><ArrowLeft size={14} /> All AI tools</button>
        <div className="mt-5 border border-black/10 bg-[var(--surface)] p-6">
          <span className="grid size-11 place-items-center rounded-full text-white" style={{ background: active.accent }}><ActiveIcon size={20} /></span>
          <h2 className="mt-5 font-serif text-4xl leading-none">{active.shortTitle}</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{active.promise}</p>
          <div className="mt-7 grid gap-2">
            {active.questions.map((item, index) => (
              <button
                key={item.key}
                onClick={() => !result && setStep(index)}
                className={`flex items-center gap-3 border p-3 text-left text-xs font-bold transition ${index === step && !result ? "border-[var(--primary)] bg-[var(--background)]" : "border-black/8"}`}
              >
                <span className={`grid size-6 shrink-0 place-items-center rounded-full ${index < step || result ? "bg-[var(--primary)] text-white" : "bg-black/5"}`}>
                  {index < step || result ? <Check size={13} /> : index + 1}
                </span>
                <span className="line-clamp-2">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        <AnimatePresence mode="wait">
          {!result && question ? (
            <motion.div
              key={`${active.type}-${step}`}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              className="tool-surface overflow-hidden"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="public-eyebrow">Step {step + 1} of {active.questions.length}</span>
                <span className="text-xs font-bold text-[var(--muted)]">{Math.round(progress)}% complete</span>
              </div>
              <div className="mt-4 h-1 overflow-hidden bg-black/10"><motion.div className="h-full bg-[var(--accent)]" animate={{ width: `${progress}%` }} /></div>
              <div className="mx-auto max-w-3xl py-10 md:py-16">
                <h3 className="font-serif text-5xl leading-none md:text-6xl">{question.label}</h3>
                {question.helper && <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{question.helper}</p>}
                {question.options ? (
                  <div className="mt-9 grid gap-3 sm:grid-cols-2">
                    {question.options.map((option) => (
                      <button
                        key={option}
                        onClick={() => setAnswers({ ...answers, [question.key]: option })}
                        className={`min-h-20 border p-5 text-left font-bold transition ${answer === option ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-xl" : "border-black/10 hover:border-[var(--accent)] hover:bg-[var(--background)]"}`}
                      >
                        <span className="flex items-center justify-between gap-3">{option}{answer === option && <Check size={17} />}</span>
                      </button>
                    ))}
                  </div>
                ) : question.key === "problem photo" ? (
                  <label className="mt-10 grid min-h-44 cursor-pointer place-items-center border border-dashed border-black/20 bg-[var(--background)] p-6 text-center">
                    <span>
                      <Upload className="mx-auto text-[var(--accent)]" size={28} />
                      <strong className="mt-4 block">{answer ? "Problem photo added" : "Upload JPG or PNG"}</strong>
                      <small className="mt-2 block text-[var(--muted)]">Optional · used as session context</small>
                    </span>
                    <input
                      hidden
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const form = new FormData();
                        form.set("file", file);
                        const response = await fetch("/api/visualizer/upload", { method: "POST", body: form });
                        const result = await response.json() as { ok?: boolean; url?: string; error?: string };
                        if (!response.ok || !result.ok || !result.url) {
                          setError(result.error || "Photo upload failed.");
                          return;
                        }
                        setError("");
                        setAnswers({ ...answers, [question.key]: result.url });
                      }}
                    />
                  </label>
                ) : (
                  <input
                    autoFocus
                    value={answer}
                    onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canContinue && step < active.questions.length - 1) setStep(step + 1);
                    }}
                    className="mt-10 w-full border-b border-black/30 bg-transparent py-5 text-xl outline-none focus:border-[var(--accent)]"
                    placeholder={question.placeholder || "Type your answer"}
                  />
                )}

                {step === active.questions.length - 1 && (
                  <div className="mt-10 border border-black/10 bg-[var(--background)] p-5">
                    <button onClick={() => setIncludeContact(!includeContact)} className="flex w-full items-center justify-between gap-4 text-left">
                      <span className="flex items-center gap-3"><UserRound size={18} /><span><strong className="block text-sm">Ask an advisor to follow up</strong><small className="text-[var(--muted)]">Optional — saves a lead linked to this AI session.</small></span></span>
                      <span className={`h-6 w-11 rounded-full p-1 transition ${includeContact ? "bg-[var(--primary)]" : "bg-black/15"}`}><span className={`block size-4 rounded-full bg-white transition ${includeContact ? "translate-x-5" : ""}`} /></span>
                    </button>
                    {includeContact && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-5 grid gap-4 sm:grid-cols-2">
                        <input className="border-b border-black/20 bg-transparent py-3 outline-none" placeholder="Name *" value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} />
                        <input className="border-b border-black/20 bg-transparent py-3 outline-none" placeholder="Phone / WhatsApp *" value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} />
                        <input className="border-b border-black/20 bg-transparent py-3 outline-none" placeholder="Email" type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} />
                        <input className="border-b border-black/20 bg-transparent py-3 outline-none" placeholder="City" value={contact.city} onChange={(event) => setContact({ ...contact, city: event.target.value })} />
                      </motion.div>
                    )}
                  </div>
                )}

                {error && <p className="mt-5 border-l-4 border-red-700 bg-red-700/8 p-4 text-sm font-bold text-red-800">{error}</p>}
                <div className="mt-10 flex flex-wrap justify-between gap-3">
                  <button className="public-pill" onClick={() => step === 0 ? setActive(null) : setStep(step - 1)}><ArrowLeft size={14} /> Back</button>
                  {step === active.questions.length - 1 ? (
                    <button disabled={pending || !canContinue} onClick={finish} className="hero-primary disabled:cursor-not-allowed disabled:opacity-50">
                      {pending ? <><Sparkles size={15} className="animate-pulse" /> Creating recommendation…</> : <>Create recommendation <ArrowRight size={15} /></>}
                    </button>
                  ) : (
                    <button disabled={!canContinue} onClick={() => setStep(step + 1)} className="hero-primary disabled:cursor-not-allowed disabled:opacity-40">Continue <ArrowRight size={15} /></button>
                  )}
                </div>
              </div>
            </motion.div>
          ) : result ? (
            <ResultView key="result" result={result} active={active} base={base} onReset={reset} />
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}

function ResultView({ result, active, base, onReset }: { result: WizardResult; active: Tool; base: string; onReset: () => void }) {
  const products = result.products || [];
  const shades = result.shades || [];
  const palettes = result.palettes || [];
  const system = result.system || [];
  const nextSteps = result.nextSteps || [];
  const quantity = result.quantity;
  const shadeMap = new Map(shades.map((shade) => [shade.code, shade]));
  const quoteText = encodeURIComponent(`${result.headline || active.title}\n${result.summary || ""}`);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
      <div className="relative overflow-hidden bg-[var(--primary)] p-8 text-white md:p-12">
        <span className="absolute -right-20 -top-20 size-64 rounded-full border border-white/10" />
        <span className="absolute -right-8 -top-8 size-40 rounded-full border border-white/10" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="public-eyebrow !border-white/20 !text-white/70">
              {result.providerUsed === "deterministic"
                ? "Catalogue fallback"
                : `${result.providerUsed || result.provider || "AI"} + live catalogue${result.fallbackUsed ? " · fallback route" : ""}`}
            </span>
            <span className="flex items-center gap-2 text-xs font-bold text-white/65"><Check size={15} /> Session saved{result.leadId ? " · advisor follow-up saved" : ""}</span>
          </div>
          <h3 className="mt-7 max-w-4xl font-serif text-6xl leading-[.94] md:text-7xl">{String(result.headline || "Your paint recommendation")}</h3>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">{String(result.summary || result.reason || "")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {result.recommendedFinish && <span className="border border-white/20 px-4 py-2 text-xs font-bold">Finish · {result.recommendedFinish}</span>}
            {result.severity && result.severity !== "Not applicable" && <span className="border border-white/20 px-4 py-2 text-xs font-bold">Severity · {result.severity}</span>}
          </div>
        </div>
      </div>

      {result.warning && <div className="border-l-4 border-[#A55337] bg-[#A55337]/10 p-5 text-sm font-bold leading-6">{result.warning}</div>}

      {products.length > 0 && (
        <section>
          <div className="mb-5 flex items-end justify-between"><div><span className="public-eyebrow">Product system</span><h4 className="mt-4 font-serif text-4xl">Real products from this catalogue.</h4></div><PaintBucket className="text-[var(--accent)]" /></div>
          <div className="grid gap-5 xl:grid-cols-2">
            {products.map((product, index) => (
              <motion.article
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                key={product.id}
                className="grid min-h-64 grid-cols-[125px_1fr] items-center border border-black/10 bg-[var(--surface)] p-4 sm:grid-cols-[180px_1fr]"
              >
                <div className="grid h-full min-h-52 place-items-center bg-[#F5F0E6] p-3"><img src={product.bucketImageUrl || "/placeholders/paint-bucket-aurora.svg"} alt="" className="max-h-48 w-full object-contain" /></div>
                <div className="p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{product.role} · {product.category}</span>
                  <h5 className="mt-3 font-serif text-3xl leading-none">{product.name}</h5>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">{product.shortDescription}</p>
                  <p className="mt-3 text-xs font-bold">{product.finish} · {product.coverage} sqft/L</p>
                  <Link href={`${base}/products/${product.slug}`} className="public-pill mt-5">View product <ArrowRight size={14} /></Link>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      {palettes.length > 0 && (
        <section className="pt-4">
          <span className="public-eyebrow">Palette directions</span>
          <h4 className="mt-4 font-serif text-4xl">Three ways to carry the color.</h4>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {palettes.map((palette, index) => (
              <motion.article initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * .08 }} key={`${palette.name}-${index}`} className="overflow-hidden border border-black/10 bg-[var(--surface)]">
                <div className="flex h-36">
                  {[palette.mainShadeCode, palette.accentShadeCode, palette.trimShadeCode].map((code) => {
                    const shade = shadeMap.get(code);
                    return <div key={code} className="flex-1 p-3" style={{ background: shade?.hex || "#ddd" }}><span className="text-[9px] font-black">{code}</span></div>;
                  })}
                </div>
                <div className="p-5">
                  <h5 className="font-serif text-3xl">{palette.name}</h5>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{palette.reason}</p>
                  <p className="mt-4 text-xs font-bold">{palette.finish} finish</p>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      {shades.length > 0 && (
        <section className="pt-4">
          <span className="public-eyebrow">Recommended shades</span>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {shades.slice(0, 12).map((shade) => (
              <Link key={shade.id} href={`${base}/colors/${shade.slug}`} className="group">
                <div className="aspect-[4/3] border border-black/10 transition group-hover:rounded-[3rem_3rem_0_0]" style={{ background: shade.hex }} />
                <strong className="mt-3 block font-serif text-xl">{shade.name}</strong>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{shade.code} · {shade.mood}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {system.length > 0 && (
          <section className="border border-black/10 bg-[var(--surface)] p-7">
            <span className="public-eyebrow"><Layers3 size={13} /> Database product system</span>
            <div className="mt-6 grid gap-3">
              {system.map((item, index) => <div key={`${item}-${index}`} className="grid grid-cols-[36px_1fr] items-start gap-3 border-b border-black/10 pb-3"><span className="grid size-8 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">{index + 1}</span><p className="pt-1 text-sm leading-6">{item}</p></div>)}
            </div>
          </section>
        )}
        {quantity && (quantity.areaSqft || quantity.liters) ? (
          <section className="bg-[var(--secondary)] p-7 text-[var(--primary)]">
            <span className="public-eyebrow !border-black/15"><Calculator size={13} /> Budget snapshot</span>
            <strong className="mt-7 block font-serif text-7xl">{quantity.liters || 0}<small className="ml-2 text-2xl">L</small></strong>
            <p className="mt-2 text-sm opacity-70">{quantity.areaSqft || 0} sqft · practical estimate including allowance</p>
            {quantity.packs && quantity.packs.length > 0 && <div className="mt-6 border-t border-black/15 pt-5"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Suggested packs</span><strong className="mt-2 block text-2xl">{quantity.packs.map((pack) => `${pack}L`).join(" + ")}</strong></div>}
            {Boolean(quantity.estimatedCost) && <p className="mt-5 font-bold">Estimated material direction: {Number(quantity.estimatedCost).toLocaleString()}</p>}
          </section>
        ) : null}
      </div>

      {nextSteps.length > 0 && (
        <section className="border-y border-black/10 py-7">
          <span className="public-eyebrow">What to do next</span>
          <div className="mt-5 grid gap-4 md:grid-cols-2">{nextSteps.map((item, index) => <div className="flex gap-3 text-sm font-bold" key={`${item}-${index}`}><Check className="shrink-0 text-[var(--accent)]" size={17} />{item}</div>)}</div>
        </section>
      )}

      <div className="flex flex-wrap gap-3 bg-[var(--surface)] p-6">
        <Link className="hero-primary" href={`${base}/visualizer`}><SwatchBook size={15} /> Visualize shades</Link>
        <Link className="public-pill" href={`${base}/paint-calculator`}><Calculator size={15} /> Calculate quantity</Link>
        <a className="public-pill" href={`https://wa.me/?text=${quoteText}`}><MessageCircle size={15} /> WhatsApp quote</a>
        <Link className="public-pill" href={`${base}/quote`}>Request advisor</Link>
        <button className="public-pill" onClick={onReset}><RotateCcw size={15} /> Run again</button>
      </div>
    </motion.div>
  );
}
