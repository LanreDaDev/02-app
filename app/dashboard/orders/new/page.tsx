"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { validateUrl, validatePhone } from "@/lib/utils/validation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Link as LinkIcon,
  FileText,
  MessageCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default function NewOrderPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [mlsLink, setMlsLink] = useState("");
  const [videoInstructions, setVideoInstructions] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMethod, setContactMethod] = useState<"email" | "sms" | "both">("email");

  // Load profile data
  useEffect(() => {
    if (profile) {
      setContactEmail(profile.email);
      setContactPhone(profile.phone || "");
      setContactMethod(profile.preferred_contact_method || "email");
    }
  }, [profile]);

  const validateStep = (currentStep: number): boolean => {
    setError(null);

    if (currentStep === 1) {
      if (!mlsLink.trim()) {
        setError("Please enter an MLS listing link");
        return false;
      }
      if (!validateUrl(mlsLink)) {
        setError("Please enter a valid URL");
        return false;
      }
    }

    if (currentStep === 2) {
      if (!videoInstructions.trim()) {
        setError("Please provide video instructions");
        return false;
      }
      if (videoInstructions.trim().length < 20) {
        setError("Please provide at least 20 characters of instructions");
        return false;
      }
      if (videoInstructions.length > 1000) {
        setError("Instructions must be 1000 characters or less");
        return false;
      }
    }

    if (currentStep === 3) {
      if (!contactEmail.trim()) {
        setError("Please provide an email address");
        return false;
      }
      if (contactMethod === "sms" || contactMethod === "both") {
        if (!contactPhone.trim()) {
          setError("Please provide a phone number for SMS updates");
          return false;
        }
        if (!validatePhone(contactPhone)) {
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

    if (!user) {
      setError("You must be logged in to create an order");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Create order with status "pending" (skip draft)
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          // New simplified fields
          mls_link: mlsLink,
          video_instructions: videoInstructions,
          contact_email: contactEmail,
          contact_phone: contactMethod !== "email" ? contactPhone : null,
          // Backwards compatibility fields
          property_address: "From MLS",
          source_type: "photos_only",
          price_cents: 22500, // $225 default
          special_instructions: videoInstructions,
          status: "pending", // Skip draft, go straight to pending
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Redirect to orders list
      router.push("/dashboard/orders");
    } catch (err: any) {
      setError(err.message || "Failed to create order");
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, title: "MLS Link", icon: LinkIcon },
    { number: 2, title: "Instructions", icon: FileText },
    { number: 3, title: "Contact", icon: MessageCircle },
  ];

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "40px" }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            color: "#5A5248",
            textDecoration: "none",
            marginBottom: "16px",
            transition: "color 0.2s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = "#141414")}
          onMouseOut={(e) => (e.currentTarget.style.color = "#5A5248")}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>

        <h1
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "clamp(32px, 4vw, 42px)",
            fontWeight: 600,
            color: "#141414",
            marginBottom: "8px",
            lineHeight: 1.2,
          }}
        >
          Create New Order
        </h1>
        <p style={{ fontSize: "15px", color: "#5A5248", lineHeight: 1.6 }}>
          Share your MLS listing and tell us how you want your video.
        </p>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: "40px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          {steps.map((s) => {
            const StepIcon = s.icon;
            const isActive = step === s.number;
            const isComplete = step > s.number;

            return (
              <div
                key={s.number}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: isActive
                      ? "#B8985D"
                      : isComplete
                      ? "#059669"
                      : "#E8E2D5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "8px",
                    transition: "all 0.3s",
                  }}
                >
                  {isComplete ? (
                    <CheckCircle size={24} style={{ color: "#FFFFFF" }} />
                  ) : (
                    <StepIcon
                      size={24}
                      style={{ color: isActive ? "#FFFFFF" : "#8B7E6A" }}
                    />
                  )}
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#B8985D" : "#8B7E6A",
                  }}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
        <div
          style={{
            width: "100%",
            height: "4px",
            background: "#E8E2D5",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${((step - 1) / 2) * 100}%`,
              height: "100%",
              background: "#B8985D",
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "12px",
            padding: "14px 18px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <AlertCircle size={18} style={{ color: "#DC2626", flexShrink: 0 }} />
          <span style={{ fontSize: "14px", color: "#991B1B" }}>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E8E2D5",
          borderRadius: "12px",
          padding: "40px",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
        }}
      >
        {/* Step 1: MLS Link */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  background: "linear-gradient(135deg, #B8985D 0%, #D4B883 100%)",
                  borderRadius: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <LinkIcon size={32} style={{ color: "#FFFFFF" }} />
              </div>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  fontFamily: "Playfair Display, serif",
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                Share Your MLS Listing
              </h2>
              <p style={{ color: "#5A5248", fontSize: "15px" }}>
                Paste your MLS listing link below. We'll handle the rest!
              </p>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                MLS Listing Link *
              </label>
              <input
                type="url"
                value={mlsLink}
                onChange={(e) => {
                  setMlsLink(e.target.value);
                  setError(null);
                }}
                placeholder="https://www.realtor.com/realestateandhomes-detail/..."
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1px solid #D4C5A9",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontFamily: "Outfit, sans-serif",
                }}
              />
              <p
                style={{
                  fontSize: "13px",
                  color: "#8B7E6A",
                  marginTop: "8px",
                }}
              >
                Supported: Realtor.com, Zillow, Redfin, or any MLS listing URL
              </p>
            </div>

            <div
              style={{
                background: "#F0F9FF",
                border: "1px solid #BAE6FD",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                gap: "12px",
              }}
            >
              <Sparkles size={20} style={{ color: "#0284C7", flexShrink: 0 }} />
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0C4A6E",
                    marginBottom: "4px",
                  }}
                >
                  Coming Soon: Auto-fetch
                </p>
                <p style={{ fontSize: "13px", color: "#075985" }}>
                  We're working on automatically extracting photos from your MLS
                  listing. For now, we'll collect them manually.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Video Instructions */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  background: "linear-gradient(135deg, #B8985D 0%, #D4B883 100%)",
                  borderRadius: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <FileText size={32} style={{ color: "#FFFFFF" }} />
              </div>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  fontFamily: "Playfair Display, serif",
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                Tell Us Your Vision
              </h2>
              <p style={{ color: "#5A5248", fontSize: "15px" }}>
                Describe how you want your video to look and feel
              </p>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                Video Instructions *
              </label>
              <textarea
                value={videoInstructions}
                onChange={(e) => {
                  setVideoInstructions(e.target.value);
                  setError(null);
                }}
                placeholder="Example: Create an elegant video showcasing this luxury home. Emphasize the mountain views, chef's kitchen, and spa-like master bath. Use calm, sophisticated music. Target high-end buyers."
                rows={8}
                maxLength={1000}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1px solid #D4C5A9",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontFamily: "Outfit, sans-serif",
                  resize: "vertical",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "8px",
                }}
              >
                <p style={{ fontSize: "13px", color: "#8B7E6A" }}>
                  Tell us about the property highlights, music style, target
                  audience, etc.
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color:
                      videoInstructions.length > 900 ? "#DC2626" : "#8B7E6A",
                    fontWeight: videoInstructions.length > 900 ? 600 : 400,
                  }}
                >
                  {videoInstructions.length} / 1000
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Contact Preferences */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  background: "linear-gradient(135deg, #B8985D 0%, #D4B883 100%)",
                  borderRadius: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <MessageCircle size={32} style={{ color: "#FFFFFF" }} />
              </div>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 600,
                  fontFamily: "Playfair Display, serif",
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                Stay Updated
              </h2>
              <p style={{ color: "#5A5248", fontSize: "15px" }}>
                Confirm how you'd like to receive updates about your video
              </p>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                Email Address *
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value);
                  setError(null);
                }}
                placeholder="your.email@example.com"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1px solid #D4C5A9",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontFamily: "Outfit, sans-serif",
                }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#141414",
                  marginBottom: "8px",
                }}
              >
                Phone Number
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => {
                  setContactPhone(e.target.value);
                  setError(null);
                }}
                placeholder="(555) 123-4567"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1px solid #D4C5A9",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontFamily: "Outfit, sans-serif",
                }}
              />
            </div>

            <div style={{ marginBottom: "32px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#141414",
                  marginBottom: "12px",
                }}
              >
                Preferred Contact Method *
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[
                  {
                    value: "email",
                    label: "Email",
                    description: "Receive updates via email",
                  },
                  {
                    value: "sms",
                    label: "SMS",
                    description: "Get text message updates",
                  },
                  {
                    value: "both",
                    label: "Both",
                    description: "Email and SMS notifications",
                  },
                ].map(({ value, label, description }) => (
                  <label
                    key={value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "14px 16px",
                      border:
                        contactMethod === value
                          ? "2px solid #B8985D"
                          : "1px solid #E8E2D5",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background:
                        contactMethod === value ? "#FDFBF7" : "#FFFFFF",
                      transition: "all 0.2s",
                    }}
                  >
                    <input
                      type="radio"
                      name="contact_method"
                      value={value}
                      checked={contactMethod === value}
                      onChange={(e) => {
                        setContactMethod(e.target.value as any);
                        setError(null);
                      }}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: "15px",
                          fontWeight: 600,
                          color: "#141414",
                        }}
                      >
                        {label}
                      </div>
                      <div style={{ fontSize: "13px", color: "#8B7E6A" }}>
                        {description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Price Info */}
            <div
              style={{
                background: "#FAF8F3",
                border: "1px solid #E8E2D5",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#8B7E6A",
                    marginBottom: "4px",
                  }}
                >
                  Starting Price
                </p>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: 600,
                    fontFamily: "Playfair Display, serif",
                    color: "#B8985D",
                  }}
                >
                  $225
                </p>
              </div>
              <p style={{ fontSize: "12px", color: "#8B7E6A", maxWidth: "200px" }}>
                Final price may vary based on complexity
              </p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
          {step > 1 && (
            <button
              onClick={handleBack}
              disabled={loading}
              style={{
                flex: 1,
                padding: "14px",
                background: "#FFFFFF",
                color: "#5A5248",
                border: "1px solid #D4C5A9",
                borderRadius: "8px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: loading ? 0.5 : 1,
              }}
            >
              <ArrowLeft size={18} />
              Back
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              disabled={loading}
              style={{
                flex: 1,
                padding: "14px",
                background: "#B8985D",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: loading ? 0.5 : 1,
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.background = "#9D7F4C";
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.background = "#B8985D";
              }}
            >
              Continue
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                flex: 1,
                padding: "14px",
                background: loading ? "#D4C5A9" : "#B8985D",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {loading ? "Submitting..." : "Submit Order"}
              <CheckCircle size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Footer Note */}
      <div style={{ textAlign: "center", marginTop: "24px" }}>
        <p style={{ fontSize: "13px", color: "#8B7E6A" }}>
          Step {step} of 3 • We'll reach out within 24 hours
        </p>
      </div>
    </div>
  );
}
