import { toast } from 'sonner';

export interface PreviewGalleryItem {
    url: string;
    orientation: 'landscape' | 'portrait';
    file?: File;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validates files against size limit and detects image orientation.
 * Calls onAdd for each valid file with its data URL and detected orientation.
 */
export function processImageFiles(
    files: File[],
    onAdd: (item: PreviewGalleryItem) => void
) {
    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= MAX_FILE_SIZE);
    if (validFiles.length < files.length) {
        toast.error('Some files were skipped');
    }
    validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const src = ev.target?.result as string;
            const img = new Image();
            img.onload = () => {
                const orientation = img.height > img.width ? 'portrait' : 'landscape';
                onAdd({ url: src, orientation, file });
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Handler for <input type="file"> onChange events.
 * Validates size (5MB) and detects orientation, then calls onAdd per file.
 */
export function handleImageSelectFiles(
    e: React.ChangeEvent<HTMLInputElement>,
    onAdd: (item: PreviewGalleryItem) => void
) {
    if (e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        const validFiles = files.filter(f => f.size <= MAX_FILE_SIZE);
        if (validFiles.length < files.length) {
            toast.error('Some files were > 5MB and skipped');
        }
        validFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const src = ev.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    const orientation = img.height > img.width ? 'portrait' : 'landscape';
                    onAdd({ url: src, orientation, file });
                };
                img.src = src;
            };
            reader.readAsDataURL(file);
        });
    }
}

/**
 * Reorders an array by moving an item from one index to another.
 * Returns a new array.
 */
export function reorderGallery<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    const newItems = [...items];
    const [removed] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, removed);
    return newItems;
}
