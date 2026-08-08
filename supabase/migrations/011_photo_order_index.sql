-- Add order_index to photos so the user-chosen sequence is persisted for FFLF generation
ALTER TABLE photos ADD COLUMN order_index INTEGER;
