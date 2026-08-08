"use client";

import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Photo } from "@/lib/types/database";
import { GripVertical, X as XIcon } from "lucide-react";

interface SortablePhotoGridProps {
  photos: Photo[];
  selectedIds: string[];
  onReorder: (ids: string[]) => void;
  onDeselect: (id: string) => void;
}

function SortablePhoto({
  photo,
  index,
  onDeselect,
}: {
  photo: Photo;
  index: number;
  onDeselect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto" as any,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{
          position: "relative",
          borderRadius: "8px",
          overflow: "hidden",
          border: isDragging ? "2px solid #4F46E5" : "1px solid #E8E0D4",
          background: "#F5F1E8",
          aspectRatio: "4/3",
        }}
      >
        <img
          src={photo.s3_url}
          alt={photo.file_name || ""}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          draggable={false}
        />

        {/* Sequence number badge */}
        <div
          style={{
            position: "absolute",
            top: "6px",
            left: "6px",
            width: "24px",
            height: "24px",
            background: "#4F46E5",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#FFF", fontSize: "11px", fontWeight: 700 }}>
            {index + 1}
          </span>
        </div>

        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            width: "28px",
            height: "28px",
            background: "rgba(0,0,0,0.5)",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <GripVertical size={14} style={{ color: "#FFF" }} />
        </div>

        {/* Deselect button */}
        <button
          onClick={() => onDeselect(photo.id)}
          style={{
            position: "absolute",
            bottom: "6px",
            right: "6px",
            width: "24px",
            height: "24px",
            background: "rgba(0,0,0,0.6)",
            border: "none",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <XIcon size={12} style={{ color: "#FFF" }} />
        </button>
      </div>
    </div>
  );
}

export function SortablePhotoGrid({
  photos,
  selectedIds,
  onReorder,
  onDeselect,
}: SortablePhotoGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selectedPhotos = selectedIds
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is Photo => p !== undefined);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = selectedIds.indexOf(active.id as string);
      const newIndex = selectedIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const updated = [...selectedIds];
      updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, active.id as string);
      onReorder(updated);
    },
    [selectedIds, onReorder]
  );

  if (selectedPhotos.length === 0) {
    return (
      <p style={{ color: "#5A5248", fontSize: "14px", textAlign: "center", padding: "32px" }}>
        No photos selected. Go back and select photos to order them.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={selectedIds} strategy={rectSortingStrategy}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          {selectedPhotos.map((photo, index) => (
            <SortablePhoto
              key={photo.id}
              photo={photo}
              index={index}
              onDeselect={onDeselect}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
