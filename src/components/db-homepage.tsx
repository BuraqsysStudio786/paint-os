import Link from "next/link";
import {
  ArrowRight, Calculator, Droplets, Home, MapPin, MessageCircle,
  Paintbrush, Palette, ShieldCheck, Sparkles, Store, SwatchBook, WandSparkles,
} from "lucide-react";
import { HomepageProjectHelp } from "./homepage-project-help";
import { Reveal } from "./reveal";
import type { PublicProduct, PublicShade } from "./db-public";

type Data = {
  client: { id: string; name: string; slug: string; description: string; whatsappNumber: string };
  sections: { key: string; eyebrow: string | null; title: string; subtitle: string | null; backgroundImageUrl: string | null }[];
  products: PublicProduct[];
  shades: PublicShade[];
  rooms: { id: string; name: string; description: string; imageUrl: string; roomType: string }[];
  dealers: { id: string; name: string; city: string; area: string }[];
  blogs: { id: string; title: string; slug: string; excerpt: string; imageUrl: string }[];
  projects: { id: string; title: string; city: string; afterImageUrl: string }[];
  testimonials: { id: string; name: string; city: string; quote: string }[];
  faqs: { id: string; question: string; answer: string }[];
};

const toolIcons = [Palette, Sparkles, WandSparkles, Calculator, Droplets, MapPin];
const toolRoutes = ["colors", "product-finder", "visualizer", "paint-calculator", "problem-solver", "dealers"];
const toolNames = ["Color Finder", "Product Finder", "Visualizer", "Calculator", "Problem Solver", "Dealer Locator"];

export function DatabaseHomepage({ data }: { data: Data }) {
  const base = `/site/${data.client.slug}`;
  const hero = data.sections.find((section) => section.key === "hero");
  const featured = data.products[0];
  const colorOfYear = data.shades.find((shade) => shade.isColorOfYear) || data.shades[0];
  const categories = [...new Map(data.products.map((product) => [product.category.slug, product.category])).values()];
  const collections = [...new Map(data.shades.map((shade) => [shade.collection, shade])).entries()].slice(0, 5);

  return (
    <main>
      <section className="premium-hero">
        <div className="premium-hero-image" style={{ backgroundImage: `url(${hero?.backgroundImageUrl || data.rooms[0]?.imageUrl})` }} />
        <div className="premium-hero-wash" />
        <div className="relative mx-auto grid min-h-[760px] max-w-[1480px] items-end gap-10 px-5 pb-12 pt-36 md:px-8 lg:grid-cols-[1fr_420px] lg:pb-20">
          <Reveal>
            <span className="public-eyebrow !border-white/25 !text-white/70">A complete paint journey</span>
            <h1 className="mt-7 max-w-5xl font-serif text-6xl leading-[.92] tracking-[-.055em] text-white md:text-8xl">
              A world of colour, guidance, and home transformation
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
              Explore shades, find the right paint, visualize your walls, calculate quantity, and connect with dealers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="hero-primary" href={`${base}/ai-wizards`}>Start your paint journey <ArrowRight size={15} /></Link>
              <Link className="hero-secondary" href={`${base}/colors`}>Explore colours</Link>
              <Link className="hero-secondary" href={`${base}/visualizer`}>Try visualizer</Link>
            </div>
          </Reveal>
          <Reveal className="floating-tool-card">
            <span className="text-[10px] font-black uppercase tracking-[.2em] text-[var(--accent)]">Transform your space</span>
            <div className="mt-5 grid grid-cols-2 gap-px bg-black/10">
              {toolNames.map((name, index) => {
                const Icon = toolIcons[index];
                return <Link key={name} href={`${base}/${toolRoutes[index]}`} className="group bg-[var(--surface)] p-4 transition hover:bg-[var(--primary)] hover:text-white"><Icon size={18} /><strong className="mt-7 block text-sm">{name}</strong></Link>;
              })}
            </div>
          </Reveal>
        </div>
      </section>

      <PremiumSection eyebrow="Colour of the season" title="A palette designed for the way light moves through a home.">
        <div className="grid overflow-hidden bg-[var(--surface)] lg:grid-cols-[1.05fr_.95fr]">
          <div className="min-h-[480px] bg-cover bg-center" style={{ backgroundImage: `url(${data.rooms[1]?.imageUrl || data.rooms[0]?.imageUrl})` }} />
          <div className="p-8 md:p-14">
            <span className="text-xs font-black uppercase tracking-widest text-[var(--accent)]">{colorOfYear?.code} · {colorOfYear?.collection}</span>
            <h3 className="mt-5 font-serif text-6xl">{colorOfYear?.name}</h3>
            <p className="mt-5 leading-7 text-[var(--muted)]">{colorOfYear?.description}</p>
            <div className="mt-8 flex">
              {data.shades.slice(0, 5).map((shade) => <span key={shade.id} className="h-20 flex-1" style={{ background: shade.hex }} title={`${shade.name} ${shade.code}`} />)}
            </div>
            <Link className="public-pill mt-8" href={`${base}/colors`}>Find your colour <ArrowRight size={15} /></Link>
          </div>
        </div>
      </PremiumSection>

      <section className="bg-[var(--primary)] text-white">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-20 md:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <Reveal><span className="public-eyebrow !border-white/20 !text-white/60">Painting service</span><h2 className="mt-6 font-serif text-6xl leading-none">Tell us the project. We’ll shape the next step.</h2><p className="mt-5 max-w-xl text-white/60">A compact brief is enough to connect you with product, colour, quantity, and dealer guidance.</p></Reveal>
          <Reveal className="bg-white p-7 text-[var(--text)]"><HomepageProjectHelp clientId={data.client.id} /></Reveal>
        </div>
      </section>

      {featured && (
        <PremiumSection eyebrow="Featured product" title="Performance presented like a real product campaign.">
          <div className="product-spotlight">
            <div className="grid place-items-center bg-[#EDE6D8] p-8"><img src={featured.bucketImageUrl || featured.imageUrl || "/placeholders/paint-bucket-aurora.svg"} alt={featured.name} className="max-h-[430px] w-full object-contain" /></div>
            <div className="p-8 md:p-14">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--accent)]">{featured.category.name} · {featured.finish}</span>
              <h3 className="mt-5 font-serif text-6xl leading-none">{featured.name}</h3>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">{featured.shortDescription}</p>
              <div className="mt-7 grid grid-cols-3 gap-px bg-black/10 text-sm"><Metric label="Coverage" value={`${featured.coverageSqftPerLiterOneCoat} sqft/L`} /><Metric label="Coats" value={String(featured.recommendedCoats)} /><Metric label="Surface" value={featured.surface} /></div>
              <div className="mt-8 flex flex-wrap gap-3"><Link className="hero-primary" href={`${base}/products/${featured.slug}`}>Explore product</Link><Link className="public-pill" href={`${base}/paint-calculator?product=${featured.id}`}>Calculate quantity</Link></div>
            </div>
          </div>
        </PremiumSection>
      )}

      <PremiumSection eyebrow="Everything your home needs" title="Choose by surface, not by a wall of dropdowns.">
        <div className="grid gap-px bg-black/10 sm:grid-cols-2 lg:grid-cols-3">
          {categories.slice(0, 6).map((category, index) => {
            const Icon = [Home, ShieldCheck, Droplets, Paintbrush, SwatchBook, Sparkles][index];
            return <Link key={category.slug} href={`${base}/products`} className="journey-card"><Icon strokeWidth={1.4} /><strong className="mt-16 block font-serif text-3xl">{category.name}</strong><span className="mt-5 flex items-center gap-2 text-xs font-black uppercase tracking-widest">Explore <ArrowRight size={14} /></span></Link>;
          })}
        </div>
      </PremiumSection>

      <PremiumSection eyebrow="Explore beyond colours" title="Ideas that make the finish feel intentional.">
        <div className="editorial-mosaic">
          {data.rooms.slice(0, 5).map((room, index) => <Link key={room.id} href={`${base}/rooms`} className={`mosaic-card mosaic-${index}`} style={{ backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.7),transparent 65%),url(${room.imageUrl})` }}><span>{room.roomType}</span><strong>{room.name}</strong></Link>)}
        </div>
      </PremiumSection>

      <section className="bg-[#142B23] py-20 text-white">
        <div className="mx-auto max-w-[1480px] px-5 md:px-8">
          <SectionHeader eyebrow="Colour tools" title="From uncertainty to a confident paint plan." light />
          <div className="mt-12 grid gap-px bg-white/15 sm:grid-cols-2 lg:grid-cols-3">{toolNames.map((name, index) => { const Icon = toolIcons[index]; return <Link href={`${base}/${toolRoutes[index]}`} key={name} className="min-h-52 bg-[#142B23] p-6 transition hover:bg-[#1d3a30]"><Icon className="text-[var(--secondary)]" /><strong className="mt-16 block font-serif text-3xl">{name}</strong></Link>; })}</div>
          <Link className="hero-primary mt-8" href={`${base}/ai-wizards`}>Open AI wizards <ArrowRight size={15} /></Link>
        </div>
      </section>

      <PremiumSection eyebrow="Designer collections" title="Curated shade stories, grounded in the live catalogue.">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">{collections.map(([name, lead], index) => <Link href={`${base}/colors`} className="shade-collection-card" key={name}><div className="flex h-32">{data.shades.slice(index * 2, index * 2 + 4).map((shade) => <i key={shade.id} className="flex-1" style={{ background: shade.hex }} />)}</div><div className="p-5"><span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">Collection {String(index + 1).padStart(2, "0")}</span><h3 className="mt-3 font-serif text-3xl">{name}</h3><p className="mt-2 text-sm text-[var(--muted)]">Led by {lead.name} · {lead.code}</p></div></Link>)}</div>
      </PremiumSection>

      <section className="bg-[#101513] py-20 text-white">
        <div className="mx-auto max-w-[1480px] px-5 md:px-8"><SectionHeader eyebrow="One-stop paint solutions" title="Products, expertise, and local support—connected." light /><div className="mt-12 grid gap-px bg-white/10 md:grid-cols-5">{["Paint products", "Colour consultation", "Painting service", "Dealer support", "Waterproofing"].map((item, index) => <div key={item} className="p-6"><span className="text-xs text-[var(--secondary)]">0{index + 1}</span><strong className="mt-14 block font-serif text-2xl">{item}</strong></div>)}</div><Link href={`${base}/contact`} className="hero-primary mt-8">Get expert help</Link></div>
      </section>

      <PremiumSection eyebrow="Client stories" title="Homes remembered for how they feel.">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="grid gap-px bg-black/10 md:grid-cols-2">{data.testimonials.slice(0, 4).map((item) => <blockquote className="bg-[var(--surface)] p-7" key={item.id}><p className="font-serif text-3xl leading-tight">“{item.quote}”</p><footer className="mt-10 text-xs font-black uppercase tracking-widest text-[var(--muted)]">{item.name} · {item.city}</footer></blockquote>)}</div>
          {data.projects[0] && <article className="min-h-[430px] bg-cover bg-center p-7 text-white" style={{ backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.72),transparent),url(${data.projects[0].afterImageUrl})` }}><div className="flex h-full flex-col justify-end"><span className="text-xs uppercase tracking-widest">{data.projects[0].city}</span><h3 className="mt-3 font-serif text-4xl">{data.projects[0].title}</h3></div></article>}
        </div>
      </PremiumSection>

      <PremiumSection eyebrow="Ideas & guidance" title="Practical advice, edited for real projects.">
        <div className="grid gap-6 md:grid-cols-3">{data.blogs.slice(0, 3).map((post) => <Link href={`${base}/blog/${post.slug}`} key={post.id} className="group"><div className="aspect-[4/3] bg-cover bg-center transition duration-700 group-hover:scale-[1.02]" style={{ backgroundImage: `url(${post.imageUrl})` }} /><h3 className="mt-5 font-serif text-3xl">{post.title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{post.excerpt}</p></Link>)}</div>
      </PremiumSection>

      <section className="mx-auto max-w-[1480px] px-5 pb-20 md:px-8">
        <div className="grid overflow-hidden bg-[var(--secondary)] lg:grid-cols-[1fr_.8fr]"><div className="p-9 md:p-14"><Store /><h2 className="mt-10 font-serif text-6xl">Find a store near you.</h2><p className="mt-5 max-w-xl text-black/60">{data.dealers.length} Aurora dealer locations help turn a digital plan into physical samples, products, and local advice.</p><Link className="public-pill mt-8" href={`${base}/dealers`}>Open dealer locator <ArrowRight size={15} /></Link></div><div className="grid place-items-center bg-[#D7C79E] p-8"><div className="w-full max-w-sm bg-white p-6 shadow-2xl">{data.dealers.slice(0, 3).map((dealer) => <div key={dealer.id} className="border-b border-black/10 py-4 last:border-0"><strong>{dealer.name}</strong><span className="block text-sm text-[var(--muted)]">{dealer.area}, {dealer.city}</span></div>)}</div></div></div>
      </section>

      <PremiumSection eyebrow="Useful answers" title="A clearer start to the project.">
        <div className="mx-auto max-w-4xl">{data.faqs.slice(0, 6).map((faq) => <details key={faq.id} className="border-t border-black/15 py-6"><summary className="cursor-pointer font-serif text-2xl">{faq.question}</summary><p className="mt-4 max-w-3xl leading-7 text-[var(--muted)]">{faq.answer}</p></details>)}</div>
      </PremiumSection>

      <section className="mx-auto max-w-[1480px] px-5 pb-20 md:px-8"><div className="premium-cta"><div><span className="public-eyebrow !border-white/20 !text-white/60">Begin with confidence</span><h2 className="mt-7 max-w-4xl font-serif text-6xl leading-none">Build a paint plan around your space.</h2></div><div className="flex flex-wrap gap-3"><Link className="hero-primary" href={`${base}/product-finder`}>Find my paint</Link><a className="hero-secondary" href={`https://wa.me/${data.client.whatsappNumber}`}><MessageCircle size={15} /> WhatsApp expert</a></div></div></section>
    </main>
  );
}

function PremiumSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="mx-auto max-w-[1480px] px-5 py-20 md:px-8 md:py-28"><SectionHeader eyebrow={eyebrow} title={title} /><div className="mt-12">{children}</div></section>;
}

function SectionHeader({ eyebrow, title, light = false }: { eyebrow: string; title: string; light?: boolean }) {
  return <Reveal><span className={`public-eyebrow ${light ? "!border-white/20 !text-white/60" : ""}`}>{eyebrow}</span><h2 className="mt-6 max-w-5xl font-serif text-5xl leading-[.98] tracking-[-.04em] md:text-7xl">{title}</h2></Reveal>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[var(--background)] p-4"><span className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">{label}</span><strong className="mt-2 block text-sm">{value}</strong></div>;
}
