-- Audit Immutability Triggers for Kernel (PostgreSQL)
-- Prevents UPDATE and DELETE on Event table to ensure audit records are tamper-proof

-- Function to prevent UPDATE on Event table
CREATE OR REPLACE FUNCTION prevent_event_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE not allowed on Event table - audit records are immutable';
END;
$$ LANGUAGE plpgsql;

-- Function to prevent DELETE on Event table
CREATE OR REPLACE FUNCTION prevent_event_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE not allowed on Event table - audit records are immutable';
END;
$$ LANGUAGE plpgsql;

-- Trigger to block UPDATE on Event
CREATE TRIGGER no_update_event
  BEFORE UPDATE ON "Event"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_update();

-- Trigger to block DELETE on Event
CREATE TRIGGER no_delete_event
  BEFORE DELETE ON "Event"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_delete();

-- Also protect MaterialRevision (revision history should be immutable)
CREATE OR REPLACE FUNCTION prevent_material_revision_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'UPDATE not allowed on MaterialRevision table - revision history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_material_revision_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DELETE not allowed on MaterialRevision table - revision history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_material_revision
  BEFORE UPDATE ON "MaterialRevision"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_material_revision_update();

CREATE TRIGGER no_delete_material_revision
  BEFORE DELETE ON "MaterialRevision"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_material_revision_delete();
