import { ChoiceRow, Sheet } from "@/components/Sheet";
import type { PhotoSource } from "@/lib/photos";
import { useT } from "@/lib/i18n";

/** "Add a photo": take one with the camera, or choose from the gallery. */
export function PhotoSourceSheet({ visible, onClose, onPick, title }: { visible: boolean; onClose: () => void; onPick: (source: PhotoSource) => void; title?: string }) {
  const t = useT("m_shop");
  const choose = (source: PhotoSource) => {
    onClose();
    onPick(source);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? t("photo.title")} testID="photo-source">
      <ChoiceRow icon="camera" title={t("photo.camera")} onPress={() => choose("camera")} />
      <ChoiceRow icon="image" title={t("photo.gallery")} onPress={() => choose("library")} />
    </Sheet>
  );
}
