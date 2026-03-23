CREATE INDEX "idx_email_log_status_created" ON "email_log" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_email_log_template" ON "email_log" USING btree ("template");--> statement-breakpoint
CREATE INDEX "idx_email_log_to_address" ON "email_log" USING btree ("to_address");