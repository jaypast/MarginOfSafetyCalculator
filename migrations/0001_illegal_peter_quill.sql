CREATE TABLE "sp500_refresh_leases" (
	"refresh_date" varchar(10) PRIMARY KEY NOT NULL,
	"owner_token" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL
);
