"use client";

import { FormEvent, useEffect, useState } from "react";
import PhoneInput from "./phone-input";

type Profile = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  role?: string;
};

type Props = {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
  showToast: (message: string) => void;
};

export default function ProfileSettings({ open, profile, onClose, onSaved, showToast }: Props) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile.displayName);
    setPhone(profile.phone ?? "");
  }, [open, profile.displayName, profile.phone]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim(),
        }),
      });
      const payload = await response.json() as {
        profile?: { id: string; displayName: string; email: string; phone: string };
        error?: string;
      };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Nepavyko išsaugoti");
      onSaved({
        id: payload.profile.id,
        displayName: payload.profile.displayName,
        email: payload.profile.email,
        phone: payload.profile.phone,
        role: profile.role,
      });
      showToast("Profilis atnaujintas");
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nepavyko išsaugoti");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-layer profile-settings-layer" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
      <button className="modal-scrim" onClick={() => !saving && onClose()} aria-label="Uždaryti" />
      <form className="project-modal profile-settings-modal" onSubmit={handleSubmit}>
        <div className="panel-title">
          <div><span>Paskyra</span><h2 id="profile-settings-title">Mano kontaktai</h2></div>
          <button type="button" onClick={onClose} aria-label="Uždaryti" disabled={saving}>×</button>
        </div>
        <p className="profile-settings-lead">
          Šie duomenys naudojami projektuose, kai priskiriate save kaip PV, koordinatorių ar kitą kontaktą.
        </p>
        <div className="profile-settings-fields">
          <label><span>Vardas / kaip matys kolegos *</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required autoFocus /></label>
          <label><span>El. paštas</span><input value={profile.email} readOnly aria-readonly /></label>
          <label><span>Telefonas</span><PhoneInput value={phone} onChange={setPhone} /></label>
        </div>
        <div className="panel-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Atšaukti</button>
          <button type="submit" className="primary-button" disabled={saving || !displayName.trim()}>{saving ? "Saugoma…" : "Išsaugoti"}</button>
        </div>
      </form>
    </div>
  );
}
