"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { OnboardingFormData } from "@/lib/types/database";
import { validatePhone, validateUrl } from "@/lib/utils/validation";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<OnboardingFormData>({
    full_name: "",
    company_name: "",
    phone: "",
    social_media_links: {
      x: "",
      instagram: "",
      linkedin: "",
      facebook: "",
      website: "",
    },
    business_goals: "",
    preferred_contact_method: "email",
  });

  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        full_name: profile.full_name || "",
        company_name: profile.company_name || "",
        phone: profile.phone || "",
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.onboarding_completed) {
      router.push("/dashboard");
    }
  }, [profile, router]);

  const updateField = (field: keyof OnboardingFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const updateSocialMedia = (platform: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      social_media_links: {
        ...prev.social_media_links,
        [platform]: value,
      },
    }));
    setError(null);
  };

  const handleSkip = async () => {
    try {
      setLoading(true);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ onboarding_skipped: true })
        .eq("id", user?.id);

      if (updateError) throw updateError;
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to skip onboarding");
      setLoading(false);
    }
  };

  const validateStep = (currentStep: number): boolean => {
    setError(null);

    if (currentStep === 1) {
      if (!formData.full_name.trim()) {
        setError("Please enter your name");
        return false;
      }
    }

    if (currentStep === 2) {
      const { x, instagram, linkedin, facebook, website } = formData.social_media_links;
      if (x && !validateUrl(x)) {
        setError("Please enter a valid X/Twitter URL");
        return false;
      }
      if (instagram && !validateUrl(instagram)) {
        setError("Please enter a valid Instagram URL");
        return false;
      }
      if (linkedin && !validateUrl(linkedin)) {
        setError("Please enter a valid LinkedIn URL");
        return false;
      }
      if (facebook && !validateUrl(facebook)) {
        setError("Please enter a valid Facebook URL");
        return false;
      }
      if (website && !validateUrl(website)) {
        setError("Please enter a valid website URL");
        return false;
      }
    }

    if (currentStep === 3) {
      if (!formData.business_goals.trim()) {
        setError("Please tell us about your goals");
        return false;
      }
      if (formData.business_goals.trim().length < 10) {
        setError("Please provide at least 10 characters");
        return false;
      }
    }

    if (currentStep === 4) {
      if (
        formData.preferred_contact_method === "sms" ||
        formData.preferred_contact_method === "both"
      ) {
        if (!formData.phone) {
          setError("Please provide a phone number for SMS updates");
          return false;
        }
        if (!validatePhone(formData.phone)) {
          setError("Please enter a valid phone number");
          return false;
        }
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    try {
      setLoading(true);
      setError(null);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          company_name: formData.company_name || null,
          phone: formData.phone || null,
          social_media_links: formData.social_media_links,
          business_goals: formData.business_goals,
          preferred_contact_method: formData.preferred_contact_method,
          onboarding_completed: true,
        })
        .eq("id", user?.id);

      if (updateError) throw updateError;

      await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user?.id)
        .eq("type", "onboarding_reminder");

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to complete onboarding");
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#F8F6F2", minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Outfit:wght@300;400;500;600&display=swap');
      `}</style>

      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "80px 32px 100px" }}>
        {/* Progress */}
        <div style={{ marginBottom: "48px" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: "2px",
                  background: step >= s ? "#9C8E82" : "#E8E0D4",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: "11px", color: "#9C9088", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Step {step} of 4
          </p>
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ background: "white", padding: "64px 56px", boxShadow: "0 2px 32px rgba(0,0,0,0.08)" }}
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: "#FEE",
                border: "1px solid #FCC",
                color: "#C33",
                padding: "14px 18px",
                marginBottom: "32px",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {error}
            </motion.div>
          )}

          {/* Step 1: Name & Company */}
          {step === 1 && (
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 5vw, 42px)", fontWeight: 400, lineHeight: 1.1, color: "#141414", marginBottom: "16px" }}>
                Welcome to <span style={{ color: "#9C8E82" }}>Olade</span>
              </h1>
              <p style={{ fontSize: "15px", color: "#5A5248", lineHeight: 1.7, marginBottom: "48px" }}>
                Let's get you set up. This will only take a moment.
              </p>

              <div style={{ marginBottom: "28px" }}>
                <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "10px" }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  style={{ width: "100%", padding: "14px 16px", border: "1px solid #C8C0B4", fontSize: "14px", fontFamily: "'Outfit', sans-serif", transition: "border-color 0.2s", outline: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#9C8E82")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#C8C0B4")}
                />
              </div>

              <div style={{ marginBottom: "48px" }}>
                <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "10px" }}>
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => updateField("company_name", e.target.value)}
                  style={{ width: "100%", padding: "14px 16px", border: "1px solid #C8C0B4", fontSize: "14px", fontFamily: "'Outfit', sans-serif", transition: "border-color 0.2s", outline: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#9C8E82")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#C8C0B4")}
                />
                <p style={{ fontSize: "11px", color: "#9C9088", marginTop: "6px" }}>Optional</p>
              </div>
            </div>
          )}

          {/* Step 2: Social Media */}
          {step === 2 && (
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 5vw, 42px)", fontWeight: 400, lineHeight: 1.1, color: "#141414", marginBottom: "16px" }}>
                Connect your profiles
              </h1>
              <p style={{ fontSize: "15px", color: "#5A5248", lineHeight: 1.7, marginBottom: "48px" }}>
                Share your social presence. All fields are optional.
              </p>

              {[
                { key: "x", label: "X (Twitter)" },
                { key: "instagram", label: "Instagram" },
                { key: "linkedin", label: "LinkedIn" },
                { key: "facebook", label: "Facebook" },
                { key: "website", label: "Website" },
              ].map(({ key, label }) => (
                <div key={key} style={{ marginBottom: "24px" }}>
                  <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "10px" }}>
                    {label}
                  </label>
                  <input
                    type="url"
                    value={formData.social_media_links[key as keyof typeof formData.social_media_links] || ""}
                    onChange={(e) => updateSocialMedia(key, e.target.value)}
                    style={{ width: "100%", padding: "14px 16px", border: "1px solid #C8C0B4", fontSize: "14px", fontFamily: "'Outfit', sans-serif", transition: "border-color 0.2s", outline: "none" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#9C8E82")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#C8C0B4")}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Goals */}
          {step === 3 && (
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 5vw, 42px)", fontWeight: 400, lineHeight: 1.1, color: "#141414", marginBottom: "16px" }}>
                Tell us your goals
              </h1>
              <p style={{ fontSize: "15px", color: "#5A5248", lineHeight: 1.7, marginBottom: "48px" }}>
                What do you want to achieve with Olade videos?
              </p>

              <div style={{ marginBottom: "32px" }}>
                <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "10px" }}>
                  Your Goals *
                </label>
                <textarea
                  value={formData.business_goals}
                  onChange={(e) => updateField("business_goals", e.target.value)}
                  rows={6}
                  style={{ width: "100%", padding: "14px 16px", border: "1px solid #C8C0B4", fontSize: "14px", fontFamily: "'Outfit', sans-serif", transition: "border-color 0.2s", outline: "none", resize: "vertical" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#9C8E82")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#C8C0B4")}
                />
                <p style={{ fontSize: "11px", color: "#9C9088", marginTop: "6px", textAlign: "right" }}>
                  {formData.business_goals.length} characters
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Contact */}
          {step === 4 && (
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 5vw, 42px)", fontWeight: 400, lineHeight: 1.1, color: "#141414", marginBottom: "16px" }}>
                How should we reach you?
              </h1>
              <p style={{ fontSize: "15px", color: "#5A5248", lineHeight: 1.7, marginBottom: "48px" }}>
                Choose how you'd like to receive updates about your videos.
              </p>

              <div style={{ marginBottom: "28px" }}>
                <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "10px" }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  style={{ width: "100%", padding: "14px 16px", border: "1px solid #C8C0B4", fontSize: "14px", fontFamily: "'Outfit', sans-serif", transition: "border-color 0.2s", outline: "none" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#9C8E82")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#C8C0B4")}
                />
              </div>

              <div style={{ marginBottom: "48px" }}>
                <label style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7A736A", display: "block", marginBottom: "16px" }}>
                  Preferred Contact Method *
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { value: "email", label: "Email" },
                    { value: "sms", label: "SMS" },
                    { value: "both", label: "Both" },
                  ].map(({ value, label }) => (
                    <label
                      key={value}
                      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", border: formData.preferred_contact_method === value ? "2px solid #9C8E82" : "1px solid #C8C0B4", cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <input
                        type="radio"
                        name="contact_method"
                        value={value}
                        checked={formData.preferred_contact_method === value}
                        onChange={(e) => updateField("preferred_contact_method", e.target.value)}
                        style={{ width: "16px", height: "16px" }}
                      />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#141414" }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "12px" }}>
            {step > 1 && (
              <button
                onClick={handleBack}
                disabled={loading}
                style={{ flex: 1, padding: "16px 24px", background: "white", color: "#141414", border: "2px solid #C8C0B4", fontSize: "13px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: loading ? 0.6 : 1, fontFamily: "'Outfit', sans-serif" }}
                onMouseOver={(e) => { if (!loading) { e.currentTarget.style.borderColor = "#141414"; e.currentTarget.style.background = "#F8F6F2"; } }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "#C8C0B4"; e.currentTarget.style.background = "white"; }}
              >
                Back
              </button>
            )}

            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={loading}
                style={{ flex: 1, padding: "16px 24px", background: "#141414", color: "#F8F6F2", border: "none", fontSize: "13px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: loading ? 0.6 : 1, fontFamily: "'Outfit', sans-serif" }}
                onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = "#2A2A2A"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#141414"; }}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{ flex: 1, padding: "16px 24px", background: "#141414", color: "#F8F6F2", border: "none", fontSize: "13px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: loading ? 0.6 : 1, fontFamily: "'Outfit', sans-serif" }}
                onMouseOver={(e) => { if (!loading) e.currentTarget.style.background = "#2A2A2A"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#141414"; }}
              >
                {loading ? "Completing..." : "Complete"}
              </button>
            )}
          </div>

          {step === 1 && (
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button onClick={handleSkip} disabled={loading} style={{ background: "transparent", border: "none", color: "#9C9088", fontSize: "12px", cursor: loading ? "not-allowed" : "pointer", textDecoration: "underline", letterSpacing: "0.05em" }}>
                Skip for now
              </button>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
