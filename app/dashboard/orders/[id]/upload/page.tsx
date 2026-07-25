"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { useFileUpload } from "@/lib/hooks/useFileUpload";
import { Order, OrderPhoto } from "@/lib/types/database";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  X,
  Check,
  AlertCircle,
  Home,
  GripVertical,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

interface UploadedPhoto extends OrderPhoto {
  preview?: string;
}

export default function OrderUploadPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { user } = useAuth();
  const supabase = createClient();

  const [order, setOrder] = useState<Order | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { uploads, isUploading, uploadFile } = useFileUpload({
    orderId,
    type: "photo",
    onSuccess: async (file) => {
      // Save to database
      if (file.key && file.url) {
        const { data, error } = await supabase
          .from("order_photos")
          .insert({
            order_id: orderId,
            s3_key: file.key,
            s3_url: file.url,
            file_name: file.fileName,
            order_index: photos.length,
            is_floor_plan: false,
          })
          .select()
          .single();

        if (!error && data) {
          setPhotos((prev) => [...prev, data]);
        }
      }
    },
  });

  // Load order and existing photos
  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);

      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;
      if (!orderData) throw new Error("Order not found");

      // Verify ownership
      if (orderData.user_id !== user?.id) {
        throw new Error("Unauthorized");
      }

      setOrder(orderData);

      // Fetch existing photos
      const { data: photosData, error: photosError } = await supabase
        .from("order_photos")
        .select("*")
        .eq("order_id", orderId)
        .order("order_index", { ascending: true });

      if (photosError) throw photosError;
      setPhotos(photosData || []);
    } catch (err: any) {
      setError(err.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );

      files.forEach((file) => uploadFile(file));
    },
    [uploadFile]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle file input
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file) => uploadFile(file));
    }
  };

  // Toggle floor plan
  const toggleFloorPlan = async (photoId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from("order_photos")
      .update({ is_floor_plan: !currentValue })
      .eq("id", photoId);

    if (!error) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, is_floor_plan: !currentValue } : p
        )
      );
    }
  };

  // Delete photo
  const deletePhoto = async (photoId: string) => {
    const { error } = await supabase
      .from("order_photos")
      .delete()
      .eq("id", photoId);

    if (!error) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    }
  };

  // Reorder photos
  const movePhoto = async (photoId: string, direction: "up" | "down") => {
    const currentIndex = photos.findIndex((p) => p.id === photoId);
    if (currentIndex === -1) return;

    const newIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= photos.length) return;

    const reordered = [...photos];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Update order_index for all photos
    const updates = reordered.map((photo, index) => ({
      id: photo.id,
      order_index: index,
    }));

    for (const update of updates) {
      await supabase
        .from("order_photos")
        .update({ order_index: update.order_index })
        .eq("id", update.id);
    }

    setPhotos(reordered);
  };

  // Submit order
  const handleSubmit = async () => {
    if (photos.length === 0) {
      setError("Please upload at least one photo");
      return;
    }

    try {
      setSubmitting(true);

      // Update order status to pending
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "pending" })
        .eq("id", orderId);

      if (updateError) throw updateError;

      // Redirect to orders dashboard
      router.push("/dashboard/orders");
    } catch (err: any) {
      setError(err.message || "Failed to submit order");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "400px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid #E8E2D5",
              borderTop: "3px solid #B8985D",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "#5A5248" }}>Loading order...</p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 0" }}>
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "8px",
            padding: "16px",
            display: "flex",
            gap: "12px",
          }}
        >
          <AlertCircle size={20} style={{ color: "#DC2626", flexShrink: 0 }} />
          <div>
            <p style={{ fontWeight: 600, color: "#991B1B", marginBottom: "4px" }}>
              Error Loading Order
            </p>
            <p style={{ fontSize: "14px", color: "#991B1B" }}>{error}</p>
          </div>
        </div>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            marginTop: "20px",
            color: "#B8985D",
            textDecoration: "none",
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const uploadsList = Object.values(uploads);

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <Link
          href="/dashboard/orders"
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
          Back to Orders
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <Home size={20} style={{ color: "#B8985D" }} />
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 600,
              fontFamily: "Playfair Display, serif",
              color: "#141414",
            }}
          >
            {order?.property_address}
          </h1>
        </div>
        <p style={{ color: "#5A5248", fontSize: "14px" }}>
          Upload photos for your video order
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "8px",
            padding: "12px 16px",
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <AlertCircle size={18} style={{ color: "#DC2626", flexShrink: 0 }} />
          <p style={{ fontSize: "14px", color: "#991B1B" }}>{error}</p>
        </div>
      )}

      {/* Upload Zone */}
      <div
        style={{
          border: `2px dashed ${dragActive ? "#B8985D" : "#D4C5A9"}`,
          borderRadius: "12px",
          padding: "48px 24px",
          textAlign: "center",
          background: dragActive ? "#FDFBF7" : "#FAF8F3",
          marginBottom: "32px",
          transition: "all 0.2s",
        }}
        onDrop={handleDrop}
        onDragOver={handleDrag}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            background: "#B8985D",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Upload size={32} style={{ color: "#FFFFFF" }} />
        </div>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#141414",
            marginBottom: "8px",
          }}
        >
          Upload Property Photos
        </h3>
        <p style={{ color: "#5A5248", marginBottom: "20px", fontSize: "14px" }}>
          Drag and drop your photos here, or click to browse
        </p>
        <label>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileInput}
            style={{ display: "none" }}
            disabled={isUploading}
          />
          <span
            style={{
              display: "inline-block",
              background: "#B8985D",
              color: "#FFFFFF",
              padding: "12px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: isUploading ? "not-allowed" : "pointer",
              opacity: isUploading ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            {isUploading ? "Uploading..." : "Choose Files"}
          </span>
        </label>
        <p
          style={{
            fontSize: "12px",
            color: "#8B7E6A",
            marginTop: "12px",
          }}
        >
          Supported formats: JPG, PNG, WebP
        </p>
      </div>

      {/* Upload Progress */}
      {uploadsList.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#141414",
              marginBottom: "16px",
            }}
          >
            Uploading ({uploadsList.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {uploadsList.map((upload, index) => (
              <div
                key={index}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E2D5",
                  borderRadius: "8px",
                  padding: "12px 16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ImageIcon size={16} style={{ color: "#B8985D" }} />
                    <span style={{ fontSize: "14px", color: "#141414" }}>
                      {upload.fileName}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {upload.status === "success" && (
                      <Check size={16} style={{ color: "#059669" }} />
                    )}
                    {upload.status === "error" && (
                      <AlertCircle size={16} style={{ color: "#DC2626" }} />
                    )}
                    <span style={{ fontSize: "13px", color: "#5A5248" }}>
                      {upload.progress}%
                    </span>
                  </div>
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
                      width: `${upload.progress}%`,
                      height: "100%",
                      background:
                        upload.status === "error"
                          ? "#DC2626"
                          : upload.status === "success"
                          ? "#059669"
                          : "#B8985D",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                {upload.error && (
                  <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "4px" }}>
                    {upload.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Photos Grid */}
      {photos.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "#141414",
              marginBottom: "16px",
            }}
          >
            Uploaded Photos ({photos.length})
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                style={{
                  background: "#FFFFFF",
                  border: photo.is_floor_plan
                    ? "2px solid #B8985D"
                    : "1px solid #E8E2D5",
                  borderRadius: "8px",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* Photo */}
                <div
                  style={{
                    width: "100%",
                    paddingTop: "75%",
                    position: "relative",
                    background: "#F5F1E8",
                  }}
                >
                  <img
                    src={photo.s3_url}
                    alt={photo.file_name}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>

                {/* Controls */}
                <div style={{ padding: "12px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "13px", color: "#5A5248" }}>
                      Photo {index + 1}
                    </span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        onClick={() => movePhoto(photo.id, "up")}
                        disabled={index === 0}
                        style={{
                          padding: "4px",
                          background: "transparent",
                          border: "none",
                          cursor: index === 0 ? "not-allowed" : "pointer",
                          opacity: index === 0 ? 0.3 : 1,
                        }}
                        title="Move up"
                      >
                        <GripVertical size={14} style={{ color: "#5A5248" }} />
                      </button>
                      <button
                        onClick={() => deletePhoto(photo.id)}
                        style={{
                          padding: "4px",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                        title="Delete"
                      >
                        <X size={14} style={{ color: "#DC2626" }} />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleFloorPlan(photo.id, photo.is_floor_plan)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      background: photo.is_floor_plan ? "#B8985D" : "#FFFFFF",
                      color: photo.is_floor_plan ? "#FFFFFF" : "#5A5248",
                      border: photo.is_floor_plan ? "none" : "1px solid #D4C5A9",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {photo.is_floor_plan && <CheckCircle size={14} />}
                    {photo.is_floor_plan ? "Floor Plan" : "Mark as Floor Plan"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      {photos.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #E8E2D5",
            paddingTop: "24px",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <Link
            href="/dashboard/orders"
            style={{
              padding: "12px 24px",
              background: "#FFFFFF",
              color: "#5A5248",
              border: "1px solid #D4C5A9",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Save as Draft
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || isUploading}
            style={{
              padding: "12px 32px",
              background: submitting || isUploading ? "#D4C5A9" : "#B8985D",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: submitting || isUploading ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {submitting ? "Submitting..." : "Submit Order"}
          </button>
        </div>
      )}

      {/* Empty State */}
      {photos.length === 0 && uploadsList.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "#8B7E6A",
          }}
        >
          <ImageIcon
            size={48}
            style={{ color: "#D4C5A9", marginBottom: "16px" }}
          />
          <p style={{ fontSize: "14px" }}>
            No photos uploaded yet. Drag and drop or click to upload.
          </p>
        </div>
      )}
    </div>
  );
}
