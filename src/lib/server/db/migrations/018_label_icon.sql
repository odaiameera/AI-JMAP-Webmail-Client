-- Labels get an icon like folders (folder_meta.icon). A Lucide icon name;
-- '' or NULL means none, and the label shows its colour dot.
ALTER TABLE label_meta ADD COLUMN icon TEXT;
