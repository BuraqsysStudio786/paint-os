"use client";

import { ArrowRight, Check } from "lucide-react";
import { useActionState } from "react";
import { createLeadAction } from "@/app/actions";

export function HomepageProjectHelp({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createLeadAction, null);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="source" value="homepage_project_help" />
      <label className="journey-field">Project type
        <select name="message" defaultValue="Interior repaint">
          <option>Interior repaint</option>
          <option>Exterior protection</option>
          <option>Waterproofing</option>
          <option>New construction</option>
        </select>
      </label>
      <label className="journey-field">City<input name="city" placeholder="Lahore" /></label>
      <label className="journey-field">Approximate area<input name="estimatedArea" type="number" min="1" placeholder="650 sqft" /></label>
      <label className="journey-field">Phone / WhatsApp<input name="phone" required placeholder="03xx xxxxxxx" /></label>
      <input type="hidden" name="name" value="Homepage enquiry" />
      <button disabled={pending} className="hero-primary md:col-span-2">
        {state?.success ? <><Check size={15} /> Request saved</> : <>{pending ? "Saving…" : "Get expert help"} <ArrowRight size={15} /></>}
      </button>
      {state?.error && <p className="text-sm font-bold text-red-700 md:col-span-2">{state.error}</p>}
    </form>
  );
}
