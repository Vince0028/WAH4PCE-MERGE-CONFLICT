-- ============================================================
-- WAH4PCE MERGED ERD SCHEMA (Batch 1 + ADAPT iPaaS Custom)
-- MySQL Workbench Compatible — for Reverse Engineering
-- ============================================================
-- This file contains ONLY the ADAPT iPaaS system tables:
--   • Batch 1 tables: providers, requests, audit_logs
--   • Custom addition: adapt_transaction_logs
--
-- WAH & iHOMIS are prototypes for testing only (separate schemas).
--
-- To reverse engineer in MySQL Workbench:
--   Database > Reverse Engineer > paste/import this SQL
-- ============================================================

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

DROP SCHEMA IF EXISTS `wah4pce_ipaas`;
CREATE SCHEMA `wah4pce_ipaas` DEFAULT CHARACTER SET utf8mb4;
USE `wah4pce_ipaas`;


-- ============================================================
-- 1. PROVIDERS (Batch 1 ERD)
-- ============================================================
-- Registered health facilities in the interoperability network.
-- Each org authenticates via API key to connect to the iPaaS.

CREATE TABLE `providers` (
  `provider_id` VARCHAR(50) NOT NULL,
  `facility_name` VARCHAR(255) NOT NULL,
  `facility_type` VARCHAR(50) DEFAULT NULL
    COMMENT 'e.g. Hospital, Clinic, RHU',
  `api_key_hash` VARCHAR(255) DEFAULT NULL
    COMMENT 'Hashed API key for authentication',
  `api_key_created_at` TIMESTAMP NULL DEFAULT NULL,
  `api_key_status` VARCHAR(20) DEFAULT 'ACTIVE'
    COMMENT 'ACTIVE, REVOKED, EXPIRED',
  `contact_email` VARCHAR(255) DEFAULT NULL,
  `registration_status` VARCHAR(25) DEFAULT 'PENDING'
    COMMENT 'PENDING, APPROVED, SUSPENDED',
  `registered_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`provider_id`),
  INDEX `idx_provider_status` (`registration_status`),
  INDEX `idx_provider_facility_type` (`facility_type`),
  INDEX `idx_provider_api_status` (`api_key_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='[BATCH 1] Registered health facilities — API key auth for connecting to iPaaS';


-- ============================================================
-- 2. REQUESTS (Batch 1 ERD)
-- ============================================================
-- Central request tracking between providers.
-- Tracks who is requesting data, from whom, and the status.

CREATE TABLE `requests` (
  `request_id` VARCHAR(50) NOT NULL,
  `requestor_provider_id` VARCHAR(50) NOT NULL
    COMMENT 'FK to providers — who is asking',
  `target_provider_id` VARCHAR(50) NOT NULL
    COMMENT 'FK to providers — who is being asked',
  `patient_identifier` VARCHAR(255) DEFAULT NULL
    COMMENT 'PhilHealth no. or other patient ID',
  `data_type_requested` VARCHAR(100) DEFAULT NULL
    COMMENT 'e.g. patient_demographics, lab_results',
  `request_purpose` TEXT DEFAULT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    COMMENT 'PENDING, PROCESSING, COMPLETED, DENIED, FAILED, EXPIRED',
  `submitted_data_format` VARCHAR(25) DEFAULT NULL
    COMMENT 'HL7V2, FHIR_R4, CDA_R2',
  `attempt_count` INT DEFAULT 0,
  `max_attempts` INT DEFAULT 3,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  INDEX `idx_req_requestor` (`requestor_provider_id`),
  INDEX `idx_req_target` (`target_provider_id`),
  INDEX `idx_req_status` (`status`),
  INDEX `idx_req_created` (`created_at` DESC),
  CONSTRAINT `fk_req_requestor_provider`
    FOREIGN KEY (`requestor_provider_id`) REFERENCES `providers` (`provider_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_req_target_provider`
    FOREIGN KEY (`target_provider_id`) REFERENCES `providers` (`provider_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='[BATCH 1] Data exchange requests between providers';


-- ============================================================
-- 3. AUDIT_LOGS (Batch 1 ERD)
-- ============================================================
-- Logs every event in the system for traceability.

CREATE TABLE `audit_logs` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `request_id` VARCHAR(50) DEFAULT NULL
    COMMENT 'FK to requests — which request triggered this',
  `event_type` VARCHAR(50) NOT NULL
    COMMENT 'e.g. REQUEST_CREATED, DATA_SENT, TRANSFORM_ERROR',
  `event_category` VARCHAR(30) DEFAULT NULL
    COMMENT 'e.g. REQUEST, TRANSFORM, AUTH, SYSTEM',
  `actor_provider_id` VARCHAR(50) DEFAULT NULL
    COMMENT 'FK to providers — who performed the action',
  `actor_type` VARCHAR(20) DEFAULT NULL
    COMMENT 'PROVIDER, SYSTEM, ADMIN',
  `event_details` JSON DEFAULT NULL
    COMMENT 'Flexible JSON payload for event-specific data',
  `event_timestamp` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `providers_provider_id` VARCHAR(50) DEFAULT NULL
    COMMENT 'Denormalized FK to providers',
  PRIMARY KEY (`log_id`),
  INDEX `idx_audit_request` (`request_id`),
  INDEX `idx_audit_event_type` (`event_type`),
  INDEX `idx_audit_category` (`event_category`),
  INDEX `idx_audit_actor` (`actor_provider_id`),
  INDEX `idx_audit_timestamp` (`event_timestamp` DESC),
  CONSTRAINT `fk_audit_request`
    FOREIGN KEY (`request_id`) REFERENCES `requests` (`request_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_actor_provider`
    FOREIGN KEY (`actor_provider_id`) REFERENCES `providers` (`provider_id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='[BATCH 1] System-wide event audit log';


-- ============================================================
-- 4. ADAPT_TRANSACTION_LOGS (Custom — WAH4PCE Addition)
-- ============================================================
-- iPaaS AI transformation pipeline log.
-- Tracks every data exchange with full source/destination
-- format tracking and transformation payloads.

CREATE TABLE `adapt_transaction_logs` (
  `id` CHAR(36) NOT NULL
    COMMENT 'UUID primary key',
  `request_id` VARCHAR(50) DEFAULT NULL
    COMMENT 'Optional link to the data exchange request',
  `source_system` VARCHAR(50) NOT NULL
    COMMENT 'Provider ID that sent data',
  `destination_system` VARCHAR(50) NOT NULL
    COMMENT 'Provider ID receiving data',
  `source_format` VARCHAR(20) NOT NULL DEFAULT 'HL7V2'
    COMMENT 'HL7V2, FHIR_R4, or CDA_R2',
  `destination_format` VARCHAR(20) NOT NULL DEFAULT 'FHIR_R4'
    COMMENT 'HL7V2, FHIR_R4, or CDA_R2',
  `raw_payload` JSON NOT NULL
    COMMENT 'Input: raw payload from source system',
  `transformed_payload` JSON DEFAULT NULL
    COMMENT 'Output: AI-transformed data for destination',
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    COMMENT 'PENDING, TRANSFORMING, SUCCESS, QUARANTINED',
  `error_message` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_adapt_status` (`status`),
  INDEX `idx_adapt_source` (`source_system`),
  INDEX `idx_adapt_dest` (`destination_system`),
  INDEX `idx_adapt_src_fmt` (`source_format`),
  INDEX `idx_adapt_dest_fmt` (`destination_format`),
  INDEX `idx_adapt_created` (`created_at` DESC),
  INDEX `idx_adapt_request_id` (`request_id`),
  CONSTRAINT `fk_adapt_request`
    FOREIGN KEY (`request_id`) REFERENCES `requests` (`request_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_adapt_source_provider`
    FOREIGN KEY (`source_system`) REFERENCES `providers` (`provider_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_adapt_dest_provider`
    FOREIGN KEY (`destination_system`) REFERENCES `providers` (`provider_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='[CUSTOM] ADAPT iPaaS AI transformation pipeline — tracks HL7v2 <-> FHIR R4 translations';


SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- ============================================================
-- SUMMARY — ADAPT iPaaS ERD (Batch 1 + Custom)
-- ============================================================
--
-- Batch 1 Tables (3):
--   1. providers              — Facility identity + API key auth
--   2. requests               — Central request tracking with retries
--   3. audit_logs             — System-wide event log
--
-- Custom Table (1):
--   4. adapt_transaction_logs — AI transformation pipeline
--
-- Total: 4 tables
--
-- Relationships:
--   providers (1:M) ──initiates──> requests
--   providers (1:M) ──receives──> requests
--   requests  (1:M) ──generates──> audit_logs
--   providers (1:M) ──performs──> audit_logs
--   requests  (1:M) ──triggers──> adapt_transaction_logs
--   providers (1:M) ──sends──> adapt_transaction_logs
--   providers (1:M) ──receives──> adapt_transaction_logs
--

