--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8 (Debian 16.8-1.pgdg120+1)
-- Dumped by pg_dump version 16.8 (Debian 16.8-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: validation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.validation_status AS ENUM (
    'pending',
    'valid',
    'invalid',
    'redirect',
    'error'
);


--
-- Name: audit_test_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_test_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO test_audit_log (entity_type, entity_id, action, changes, performed_by)
    VALUES (
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE 
            WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)
            WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
            WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        END,
        COALESCE(current_setting('app.current_user', true), 'system')
    );
    RETURN NEW;
END;
$$;


--
-- Name: calculate_test_metrics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_test_metrics(p_run_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total INTEGER;
    v_executed INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_blocked INTEGER;
    v_skipped INTEGER;
BEGIN
    SELECT 
        COUNT(DISTINCT tc.id),
        COUNT(DISTINCT CASE WHEN te.status IS NOT NULL THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'passed' THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'failed' THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'blocked' THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'skipped' THEN tc.id END)
    INTO v_total, v_executed, v_passed, v_failed, v_blocked, v_skipped
    FROM test_cases tc
    LEFT JOIN test_executions te ON tc.id = te.test_case_id AND te.run_id = p_run_id;
    
    INSERT INTO test_metrics (
        run_id, metric_date, total_tests, tests_executed, 
        tests_passed, tests_failed, tests_blocked, tests_skipped,
        pass_rate, automation_rate
    ) VALUES (
        p_run_id, CURRENT_DATE, v_total, v_executed,
        v_passed, v_failed, v_blocked, v_skipped,
        CASE WHEN v_executed > 0 THEN (v_passed::DECIMAL / v_executed) * 100 ELSE 0 END,
        (SELECT COUNT(*)::DECIMAL / v_total * 100 FROM test_cases WHERE automated = true)
    );
END;
$$;


--
-- Name: ensure_metadata_for_enriched_bookmarks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_metadata_for_enriched_bookmarks() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If bookmark is being marked as enriched
    IF NEW.enriched = true AND OLD.enriched = false THEN
        -- Check if metadata exists
        IF NOT EXISTS (
            SELECT 1 FROM bookmark_metadata 
            WHERE bookmark_id = NEW.id
        ) THEN
            -- Create minimal metadata record
            INSERT INTO bookmark_metadata (bookmark_id, extracted_at)
            VALUES (NEW.id, NOW());
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: get_task_progress(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_task_progress(p_task_id character varying) RETURNS TABLE(task_id character varying, status character varying, current_agent character varying, progress_percentage numeric, last_message text, artifact_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.status,
        t.current_agent,
        ROUND(CASE 
            WHEN t.total_steps > 0 THEN (t.current_step::NUMERIC / t.total_steps) * 100 
            ELSE COALESCE((m.metadata->>'progress')::NUMERIC, 0)
        END, 2) as progress_percentage,
        m.content as last_message,
        COUNT(DISTINCT a.id) as artifact_count
    FROM a2a_tasks t
    LEFT JOIN a2a_artifacts a ON t.id = a.task_id
    LEFT JOIN LATERAL (
        SELECT content, metadata
        FROM a2a_messages
        WHERE task_id = t.id
        ORDER BY timestamp DESC
        LIMIT 1
    ) m ON true
    WHERE t.id = p_task_id
    GROUP BY t.id, m.content, m.metadata;
END;
$$;


--
-- Name: migrate_bookmark_status_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_bookmark_status_fields() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update status based on current boolean fields
    UPDATE bookmarks 
    SET status = CASE
        WHEN is_deleted = true THEN 'archived'
        WHEN is_dead = true THEN 'failed'
        WHEN is_valid = false THEN 'failed'
        WHEN enriched = true THEN 'enriched'
        WHEN is_valid = true AND enriched = false THEN 'validated'
        ELSE 'imported'
    END
    WHERE status IS NULL OR status = 'imported';
    
    -- Log migration
    RAISE NOTICE 'Migrated bookmark status fields for % bookmarks', 
        (SELECT COUNT(*) FROM bookmarks);
END;
$$;


--
-- Name: search_bookmarks_semantic(public.vector, uuid, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_bookmarks_semantic(query_embedding public.vector, user_id_param uuid, similarity_threshold double precision DEFAULT 0.5, limit_param integer DEFAULT 20) RETURNS TABLE(bookmark_id uuid, url text, title text, description text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.url,
        b.title,
        b.description,
        1 - (be.embedding <=> query_embedding) as similarity
    FROM bookmarks b
    JOIN bookmark_embeddings be ON b.id = be.bookmark_id
    WHERE b.user_id = user_id_param
        AND b.is_valid = true
        AND 1 - (be.embedding <=> query_embedding) > similarity_threshold
    ORDER BY be.embedding <=> query_embedding
    LIMIT limit_param;
END;
$$;


--
-- Name: update_task_status(character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_task_status(p_task_id character varying, p_status character varying, p_error_message text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE a2a_tasks 
    SET 
        status = p_status,
        updated = NOW(),
        error_message = COALESCE(p_error_message, error_message)
    WHERE id = p_task_id;
END;
$$;


--
-- Name: update_task_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_task_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _sqlx_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._sqlx_migrations (
    version bigint NOT NULL,
    description text NOT NULL,
    installed_on timestamp with time zone DEFAULT now() NOT NULL,
    success boolean NOT NULL,
    checksum bytea NOT NULL,
    execution_time bigint NOT NULL
);


--
-- Name: a2a_agent_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.a2a_agent_capabilities (
    agent_type character varying(255) NOT NULL,
    version character varying(50) DEFAULT '1.0.0'::character varying NOT NULL,
    description text,
    capabilities jsonb NOT NULL,
    endpoints jsonb NOT NULL,
    authentication text[] DEFAULT ARRAY['bearer'::text],
    protocols text[] DEFAULT ARRAY['a2a'::text, 'http'::text],
    status character varying(50) DEFAULT 'active'::character varying,
    last_heartbeat timestamp with time zone,
    created timestamp with time zone DEFAULT now() NOT NULL,
    updated timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT a2a_agent_capabilities_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'deprecated'::character varying])::text[])))
);


--
-- Name: a2a_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.a2a_artifacts (
    id character varying(255) NOT NULL,
    task_id character varying(255) NOT NULL,
    agent_type character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    mime_type character varying(255) DEFAULT 'application/json'::character varying NOT NULL,
    data jsonb NOT NULL,
    created timestamp with time zone DEFAULT now() NOT NULL,
    immutable boolean DEFAULT true NOT NULL,
    size_bytes integer,
    checksum character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: a2a_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.a2a_messages (
    id character varying(255) NOT NULL,
    task_id character varying(255) NOT NULL,
    agent_type character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    content text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT a2a_messages_type_check CHECK (((type)::text = ANY ((ARRAY['progress'::character varying, 'status'::character varying, 'error'::character varying, 'warning'::character varying, 'info'::character varying, 'completion'::character varying])::text[])))
);


--
-- Name: a2a_task_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.a2a_task_progress (
    task_id character varying(255) NOT NULL,
    agent_type character varying(100) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    started timestamp without time zone,
    completed timestamp without time zone,
    error_message text,
    attempts integer DEFAULT 0,
    job_id character varying(255),
    progress_data jsonb DEFAULT '{}'::jsonb,
    created timestamp without time zone DEFAULT now(),
    updated timestamp without time zone DEFAULT now()
);


--
-- Name: a2a_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.a2a_tasks (
    id character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    status character varying(50) NOT NULL,
    created timestamp with time zone DEFAULT now() NOT NULL,
    updated timestamp with time zone DEFAULT now() NOT NULL,
    workflow_type character varying(255),
    workflow_agents text[],
    current_agent character varying(255),
    current_step integer DEFAULT 0,
    total_steps integer,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    error_message text,
    current_job_id character varying(255),
    current_job_queue character varying(255),
    CONSTRAINT a2a_tasks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: bookmark_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmark_collections (
    bookmark_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    "position" integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bookmark_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmark_embeddings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bookmark_id uuid NOT NULL,
    embedding public.vector(1536),
    model_version character varying(50) DEFAULT 'text-embedding-ada-002'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bookmark_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmark_metadata (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bookmark_id uuid NOT NULL,
    og_title text,
    og_description text,
    og_image text,
    keywords text[],
    author character varying(255),
    published_date date,
    content_snippet text,
    language character varying(10),
    reading_time integer,
    extracted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    category character varying(100),
    subcategory character varying(100),
    canonical_url text,
    content_type text,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bookmark_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmark_tags (
    bookmark_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmarks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    url text NOT NULL,
    title text NOT NULL,
    description text,
    domain character varying(255),
    favicon_url text,
    is_valid boolean DEFAULT true,
    last_checked timestamp with time zone,
    http_status integer,
    content_hash character varying(64),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    imported_at timestamp with time zone,
    chrome_add_date bigint,
    is_deleted boolean DEFAULT false,
    is_dead boolean DEFAULT false,
    favicon text,
    enriched boolean DEFAULT false,
    import_id uuid,
    validation_errors jsonb DEFAULT '[]'::jsonb,
    check_attempts integer DEFAULT 0,
    enrichment_data jsonb DEFAULT '{}'::jsonb,
    ai_tags text[] DEFAULT '{}'::text[],
    ai_summary text,
    screenshot_url text,
    status character varying(50) DEFAULT 'imported'::character varying,
    CONSTRAINT bookmarks_status_check CHECK (((status)::text = ANY ((ARRAY['imported'::character varying, 'validated'::character varying, 'enriched'::character varying, 'failed'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: COLUMN bookmarks.is_valid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.is_valid IS 'DEPRECATED: Use status field instead';


--
-- Name: COLUMN bookmarks.last_checked; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.last_checked IS 'Timestamp of last validation check';


--
-- Name: COLUMN bookmarks.is_deleted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.is_deleted IS 'DEPRECATED: Use status field instead. Archived bookmarks have status=archived';


--
-- Name: COLUMN bookmarks.is_dead; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.is_dead IS 'DEPRECATED: Use status field instead';


--
-- Name: COLUMN bookmarks.validation_errors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.validation_errors IS 'Array of validation error objects with code and message';


--
-- Name: COLUMN bookmarks.check_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.check_attempts IS 'Number of validation attempts made';


--
-- Name: COLUMN bookmarks.enrichment_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.enrichment_data IS 'Additional metadata from AI enrichment';


--
-- Name: COLUMN bookmarks.ai_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.ai_tags IS 'AI-generated tags for categorization';


--
-- Name: COLUMN bookmarks.ai_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.ai_summary IS 'AI-generated summary of the bookmark content';


--
-- Name: COLUMN bookmarks.screenshot_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.screenshot_url IS 'URL to screenshot of the bookmark page';


--
-- Name: COLUMN bookmarks.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookmarks.status IS 'Unified status field replacing is_valid/is_dead/is_deleted booleans. Values: imported, validated, enriched, failed, archived';


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_public boolean DEFAULT false,
    share_token character varying(32),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    file_size bigint,
    total_bookmarks integer,
    new_bookmarks integer,
    updated_bookmarks integer,
    failed_bookmarks integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    file_name character varying(255),
    total_count integer,
    processed_count integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    total_invalid integer DEFAULT 0,
    total_enriched integer DEFAULT 0,
    validation_details jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT import_history_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: COLUMN import_history.total_invalid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.import_history.total_invalid IS 'Total number of invalid bookmarks in this import';


--
-- Name: COLUMN import_history.total_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.import_history.total_enriched IS 'Total number of enriched bookmarks in this import';


--
-- Name: COLUMN import_history.validation_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.import_history.validation_details IS 'Detailed validation statistics and errors';


--
-- Name: log_aggregations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_aggregations (
    id integer NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    aggregation_type character varying(50) NOT NULL,
    service character varying(50),
    level character varying(10),
    total_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    avg_duration_ms numeric(10,2),
    p95_duration_ms numeric(10,2),
    unique_users integer DEFAULT 0,
    metadata jsonb
);


--
-- Name: log_aggregations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_aggregations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_aggregations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.log_aggregations_id_seq OWNED BY public.log_aggregations.id;


--
-- Name: log_ai_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_ai_analysis (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    analysis_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    affected_services text[],
    recommendations jsonb,
    confidence_score numeric(3,2),
    metadata jsonb
);


--
-- Name: log_ai_analysis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_ai_analysis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_ai_analysis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.log_ai_analysis_id_seq OWNED BY public.log_ai_analysis.id;


--
-- Name: problem_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.problem_reports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pr_number character varying(50) NOT NULL,
    issue_id uuid,
    type character varying(20) NOT NULL,
    title character varying(500) NOT NULL,
    description text NOT NULL,
    steps_to_reproduce text,
    expected_behavior text,
    actual_behavior text,
    impact_analysis text,
    workaround text,
    priority character varying(20) NOT NULL,
    category character varying(100),
    reported_by character varying(255) NOT NULL,
    reported_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    resolution text,
    resolution_date timestamp with time zone,
    status character varying(50) DEFAULT 'open'::character varying,
    attachments jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs (
    id bigint NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    level character varying(10) NOT NULL,
    service character varying(50) NOT NULL,
    source character varying(100),
    message text NOT NULL,
    metadata jsonb,
    error_type character varying(100),
    error_message text,
    error_stack text,
    user_id uuid,
    request_id character varying(50),
    duration_ms integer,
    status_code integer
);


--
-- Name: TABLE system_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_logs IS 'Consider partitioning by timestamp for logs older than 30 days. Use pg_partman extension for automated partition management.';


--
-- Name: system_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_logs_id_seq OWNED BY public.system_logs.id;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(7) DEFAULT '#3182ce'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: test_audit_trail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_audit_trail (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    run_id character varying(50) NOT NULL,
    action character varying(100) NOT NULL,
    actor character varying(100) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    ip_address inet,
    user_agent text,
    action_details jsonb,
    system_state jsonb
);


--
-- Name: test_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_cases (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    suite_id uuid,
    test_id character varying(100) NOT NULL,
    name character varying(500) NOT NULL,
    description text,
    type character varying(50) NOT NULL,
    category character varying(50),
    preconditions text,
    test_data jsonb,
    steps jsonb NOT NULL,
    expected_results jsonb NOT NULL,
    actual_results jsonb,
    requirements text[],
    user_stories text[],
    priority character varying(20) DEFAULT 'medium'::character varying,
    automated boolean DEFAULT false,
    test_script_path character varying(500),
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: test_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_executions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    test_case_id uuid,
    execution_id character varying(100) NOT NULL,
    run_id uuid,
    status character varying(50) NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_ms integer,
    executed_by character varying(255),
    environment jsonb,
    test_data_used jsonb,
    steps_executed jsonb,
    screenshots text[],
    videos text[],
    logs text,
    error_message text,
    error_stack text,
    failure_type character varying(100),
    retry_count integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: test_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_plans (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    version character varying(50) NOT NULL,
    description text,
    scope text,
    objectives jsonb,
    acceptance_criteria jsonb,
    risk_assessment jsonb,
    created_by character varying(255) NOT NULL,
    approved_by character varying(255),
    approval_date timestamp with time zone,
    status character varying(50) DEFAULT 'draft'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: test_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_runs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    run_id character varying(50) NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    status character varying(20) NOT NULL,
    environment jsonb NOT NULL,
    test_plan_checksum character varying(64) NOT NULL,
    total_tests integer,
    passed integer,
    failed integer,
    skipped integer,
    artifacts_path character varying(500) NOT NULL,
    created_by character varying(100) NOT NULL,
    machine_info jsonb,
    git_commit character varying(40),
    git_branch character varying(100)
);


--
-- Name: test_step_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_step_executions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    execution_id character varying(100) NOT NULL,
    step_number integer NOT NULL,
    step_id character varying(100) NOT NULL,
    action_type character varying(50) NOT NULL,
    target_element text,
    input_data jsonb,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    status character varying(20) NOT NULL,
    screenshot_before character varying(500),
    screenshot_after character varying(500),
    screenshot_checksum character varying(64),
    error_details jsonb,
    validation_results jsonb,
    audit_metadata jsonb NOT NULL
);


--
-- Name: test_suites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_suites (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    plan_id uuid,
    name character varying(255) NOT NULL,
    description text,
    layer character varying(50) NOT NULL,
    module character varying(100) NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying,
    estimated_duration integer,
    dependencies jsonb,
    tags text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(255),
    two_factor_enabled boolean DEFAULT false NOT NULL,
    two_factor_secret character varying(255),
    two_factor_verified boolean DEFAULT false,
    recovery_codes jsonb,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    role character varying(50) DEFAULT 'user'::character varying,
    CONSTRAINT users_email_check CHECK (((email)::text ~~ '%@az1.ai'::text))
);


--
-- Name: v_active_tasks; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_tasks AS
SELECT
    NULL::character varying(255) AS id,
    NULL::character varying(255) AS type,
    NULL::character varying(50) AS status,
    NULL::character varying(255) AS workflow_type,
    NULL::character varying(255) AS current_agent,
    NULL::integer AS current_step,
    NULL::integer AS total_steps,
    NULL::numeric AS progress_percentage,
    NULL::timestamp with time zone AS created,
    NULL::timestamp with time zone AS updated,
    NULL::uuid AS user_id,
    NULL::bigint AS artifact_count,
    NULL::bigint AS message_count;


--
-- Name: v_agent_performance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_agent_performance AS
 SELECT ac.agent_type,
    ac.version,
    ac.status AS agent_status,
    count(DISTINCT t.id) AS total_tasks,
    count(DISTINCT
        CASE
            WHEN ((t.status)::text = 'completed'::text) THEN t.id
            ELSE NULL::character varying
        END) AS completed_tasks,
    count(DISTINCT
        CASE
            WHEN ((t.status)::text = 'failed'::text) THEN t.id
            ELSE NULL::character varying
        END) AS failed_tasks,
    round(avg(EXTRACT(epoch FROM (m2."timestamp" - m1."timestamp"))), 2) AS avg_duration_seconds
   FROM ((((public.a2a_agent_capabilities ac
     LEFT JOIN public.a2a_artifacts a ON (((ac.agent_type)::text = (a.agent_type)::text)))
     LEFT JOIN public.a2a_tasks t ON (((a.task_id)::text = (t.id)::text)))
     LEFT JOIN public.a2a_messages m1 ON ((((t.id)::text = (m1.task_id)::text) AND ((m1.type)::text = 'progress'::text) AND ((m1.metadata ->> 'progress'::text) = '0'::text))))
     LEFT JOIN public.a2a_messages m2 ON ((((t.id)::text = (m2.task_id)::text) AND ((m2.type)::text = 'completion'::text))))
  GROUP BY ac.agent_type, ac.version, ac.status;


--
-- Name: v_task_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_task_history AS
SELECT
    NULL::character varying(255) AS id,
    NULL::character varying(255) AS type,
    NULL::character varying(50) AS status,
    NULL::character varying(255) AS workflow_type,
    NULL::timestamp with time zone AS created,
    NULL::timestamp with time zone AS updated,
    NULL::interval AS duration,
    NULL::uuid AS user_id,
    NULL::character varying(255) AS user_email,
    NULL::bigint AS artifact_count,
    NULL::bigint AS message_count,
    NULL::text AS last_error;


--
-- Name: log_aggregations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_aggregations ALTER COLUMN id SET DEFAULT nextval('public.log_aggregations_id_seq'::regclass);


--
-- Name: log_ai_analysis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_ai_analysis ALTER COLUMN id SET DEFAULT nextval('public.log_ai_analysis_id_seq'::regclass);


--
-- Name: system_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs ALTER COLUMN id SET DEFAULT nextval('public.system_logs_id_seq'::regclass);


--
-- Name: _sqlx_migrations _sqlx_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._sqlx_migrations
    ADD CONSTRAINT _sqlx_migrations_pkey PRIMARY KEY (version);


--
-- Name: a2a_agent_capabilities a2a_agent_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_agent_capabilities
    ADD CONSTRAINT a2a_agent_capabilities_pkey PRIMARY KEY (agent_type);


--
-- Name: a2a_artifacts a2a_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_artifacts
    ADD CONSTRAINT a2a_artifacts_pkey PRIMARY KEY (id);


--
-- Name: a2a_messages a2a_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_messages
    ADD CONSTRAINT a2a_messages_pkey PRIMARY KEY (id);


--
-- Name: a2a_task_progress a2a_task_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_task_progress
    ADD CONSTRAINT a2a_task_progress_pkey PRIMARY KEY (task_id, agent_type);


--
-- Name: a2a_tasks a2a_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_tasks
    ADD CONSTRAINT a2a_tasks_pkey PRIMARY KEY (id);


--
-- Name: bookmark_collections bookmark_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_collections
    ADD CONSTRAINT bookmark_collections_pkey PRIMARY KEY (bookmark_id, collection_id);


--
-- Name: bookmark_embeddings bookmark_embeddings_bookmark_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_embeddings
    ADD CONSTRAINT bookmark_embeddings_bookmark_id_key UNIQUE (bookmark_id);


--
-- Name: bookmark_embeddings bookmark_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_embeddings
    ADD CONSTRAINT bookmark_embeddings_pkey PRIMARY KEY (id);


--
-- Name: bookmark_metadata bookmark_metadata_bookmark_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_metadata
    ADD CONSTRAINT bookmark_metadata_bookmark_id_key UNIQUE (bookmark_id);


--
-- Name: bookmark_metadata bookmark_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_metadata
    ADD CONSTRAINT bookmark_metadata_pkey PRIMARY KEY (id);


--
-- Name: bookmark_tags bookmark_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_tags
    ADD CONSTRAINT bookmark_tags_pkey PRIMARY KEY (bookmark_id, tag_id);


--
-- Name: bookmarks bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);


--
-- Name: bookmarks bookmarks_user_id_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_user_id_url_key UNIQUE (user_id, url);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: collections collections_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_share_token_key UNIQUE (share_token);


--
-- Name: import_history import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_pkey PRIMARY KEY (id);


--
-- Name: log_aggregations log_aggregations_period_start_period_end_aggregation_type_s_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_aggregations
    ADD CONSTRAINT log_aggregations_period_start_period_end_aggregation_type_s_key UNIQUE (period_start, period_end, aggregation_type, service, level);


--
-- Name: log_aggregations log_aggregations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_aggregations
    ADD CONSTRAINT log_aggregations_pkey PRIMARY KEY (id);


--
-- Name: log_ai_analysis log_ai_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_ai_analysis
    ADD CONSTRAINT log_ai_analysis_pkey PRIMARY KEY (id);


--
-- Name: problem_reports problem_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.problem_reports
    ADD CONSTRAINT problem_reports_pkey PRIMARY KEY (id);


--
-- Name: problem_reports problem_reports_pr_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.problem_reports
    ADD CONSTRAINT problem_reports_pr_number_key UNIQUE (pr_number);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);


--
-- Name: test_audit_trail test_audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_audit_trail
    ADD CONSTRAINT test_audit_trail_pkey PRIMARY KEY (id);


--
-- Name: test_cases test_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_pkey PRIMARY KEY (id);


--
-- Name: test_cases test_cases_test_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_test_id_key UNIQUE (test_id);


--
-- Name: test_executions test_executions_execution_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_executions
    ADD CONSTRAINT test_executions_execution_id_key UNIQUE (execution_id);


--
-- Name: test_executions test_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_executions
    ADD CONSTRAINT test_executions_pkey PRIMARY KEY (id);


--
-- Name: test_plans test_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_plans
    ADD CONSTRAINT test_plans_pkey PRIMARY KEY (id);


--
-- Name: test_runs test_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_pkey PRIMARY KEY (id);


--
-- Name: test_runs test_runs_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_runs
    ADD CONSTRAINT test_runs_run_id_key UNIQUE (run_id);


--
-- Name: test_step_executions test_step_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_step_executions
    ADD CONSTRAINT test_step_executions_pkey PRIMARY KEY (id);


--
-- Name: test_suites test_suites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_suites
    ADD CONSTRAINT test_suites_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_a2a_artifacts_agent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_artifacts_agent_type ON public.a2a_artifacts USING btree (agent_type);


--
-- Name: idx_a2a_artifacts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_artifacts_created ON public.a2a_artifacts USING btree (created);


--
-- Name: idx_a2a_artifacts_task_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_artifacts_task_agent ON public.a2a_artifacts USING btree (task_id, agent_type);


--
-- Name: idx_a2a_artifacts_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_artifacts_task_id ON public.a2a_artifacts USING btree (task_id);


--
-- Name: idx_a2a_artifacts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_artifacts_type ON public.a2a_artifacts USING btree (type);


--
-- Name: idx_a2a_messages_agent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_messages_agent_type ON public.a2a_messages USING btree (agent_type);


--
-- Name: idx_a2a_messages_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_messages_task_id ON public.a2a_messages USING btree (task_id);


--
-- Name: idx_a2a_messages_task_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_messages_task_recent ON public.a2a_messages USING btree (task_id, "timestamp" DESC);


--
-- Name: idx_a2a_messages_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_messages_timestamp ON public.a2a_messages USING btree ("timestamp");


--
-- Name: idx_a2a_messages_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_messages_type ON public.a2a_messages USING btree (type);


--
-- Name: idx_a2a_task_progress_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_progress_status ON public.a2a_task_progress USING btree (status);


--
-- Name: idx_a2a_task_progress_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_progress_task_id ON public.a2a_task_progress USING btree (task_id);


--
-- Name: idx_a2a_task_progress_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_progress_updated ON public.a2a_task_progress USING btree (updated DESC);


--
-- Name: idx_a2a_tasks_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_active ON public.a2a_tasks USING btree (status, updated) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying])::text[]));


--
-- Name: idx_a2a_tasks_context_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_context_gin ON public.a2a_tasks USING gin (context jsonb_path_ops);


--
-- Name: idx_a2a_tasks_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_created ON public.a2a_tasks USING btree (created);


--
-- Name: idx_a2a_tasks_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_metadata_gin ON public.a2a_tasks USING gin (metadata jsonb_path_ops);


--
-- Name: idx_a2a_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_status ON public.a2a_tasks USING btree (status);


--
-- Name: idx_a2a_tasks_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_type ON public.a2a_tasks USING btree (type);


--
-- Name: idx_a2a_tasks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_user_id ON public.a2a_tasks USING btree (user_id);


--
-- Name: idx_a2a_tasks_workflow_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_workflow_current ON public.a2a_tasks USING btree (workflow_type, current_agent, status);


--
-- Name: idx_a2a_tasks_workflow_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_tasks_workflow_type ON public.a2a_tasks USING btree (workflow_type);


--
-- Name: idx_ai_analysis_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_analysis_created ON public.log_ai_analysis USING btree (created_at DESC);


--
-- Name: idx_ai_analysis_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_analysis_severity ON public.log_ai_analysis USING btree (severity, created_at DESC);


--
-- Name: idx_bookmark_embeddings_bookmark_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmark_embeddings_bookmark_id ON public.bookmark_embeddings USING btree (bookmark_id);


--
-- Name: idx_bookmark_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmark_embeddings_vector ON public.bookmark_embeddings USING ivfflat (embedding public.vector_cosine_ops);


--
-- Name: idx_bookmark_metadata_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmark_metadata_category ON public.bookmark_metadata USING btree (category) WHERE (category IS NOT NULL);


--
-- Name: idx_bookmark_metadata_category_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmark_metadata_category_subcategory ON public.bookmark_metadata USING btree (category, subcategory) WHERE (category IS NOT NULL);


--
-- Name: idx_bookmarks_ai_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_ai_tags ON public.bookmarks USING gin (ai_tags);


--
-- Name: idx_bookmarks_check_attempts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_check_attempts ON public.bookmarks USING btree (check_attempts);


--
-- Name: idx_bookmarks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_created_at ON public.bookmarks USING btree (created_at DESC);


--
-- Name: idx_bookmarks_dead_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_dead_status ON public.bookmarks USING btree (is_dead, last_checked);


--
-- Name: idx_bookmarks_description_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_description_gin ON public.bookmarks USING gin (to_tsvector('english'::regconfig, COALESCE(description, ''::text)));


--
-- Name: idx_bookmarks_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_domain ON public.bookmarks USING btree (domain);


--
-- Name: idx_bookmarks_enriched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_enriched ON public.bookmarks USING btree (enriched, user_id);


--
-- Name: idx_bookmarks_enriched_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_enriched_created ON public.bookmarks USING btree (enriched, created_at DESC) WHERE (enriched = true);


--
-- Name: idx_bookmarks_enrichment_data_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_enrichment_data_gin ON public.bookmarks USING gin (enrichment_data jsonb_path_ops) WHERE ((enrichment_data IS NOT NULL) AND (enrichment_data <> '{}'::jsonb));


--
-- Name: idx_bookmarks_import_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_import_id ON public.bookmarks USING btree (import_id);


--
-- Name: idx_bookmarks_is_valid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_is_valid ON public.bookmarks USING btree (is_valid);


--
-- Name: idx_bookmarks_needs_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_needs_check ON public.bookmarks USING btree (id) WHERE (last_checked IS NULL);


--
-- Name: idx_bookmarks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_status ON public.bookmarks USING btree (status);


--
-- Name: idx_bookmarks_status_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_status_user_created ON public.bookmarks USING btree (status, user_id, created_at DESC);


--
-- Name: idx_bookmarks_title_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_title_gin ON public.bookmarks USING gin (to_tsvector('english'::regconfig, title));


--
-- Name: idx_bookmarks_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_user_created ON public.bookmarks USING btree (user_id, created_at DESC);


--
-- Name: idx_bookmarks_user_enriched_valid_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_user_enriched_valid_created ON public.bookmarks USING btree (user_id, enriched, is_valid, created_at DESC) INCLUDE (title, url, domain) WHERE (is_deleted = false);


--
-- Name: idx_bookmarks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_user_id ON public.bookmarks USING btree (user_id);


--
-- Name: idx_bookmarks_user_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_user_status_created ON public.bookmarks USING btree (user_id, is_valid, created_at DESC);


--
-- Name: idx_bookmarks_user_status_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_user_status_domain ON public.bookmarks USING btree (user_id, status, domain) WHERE ((status)::text <> 'archived'::text);


--
-- Name: idx_bookmarks_validation_errors_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_validation_errors_gin ON public.bookmarks USING gin (validation_errors jsonb_path_ops) WHERE ((validation_errors IS NOT NULL) AND (validation_errors <> '[]'::jsonb));


--
-- Name: idx_bookmarks_validation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookmarks_validation_status ON public.bookmarks USING btree (is_valid, last_checked);


--
-- Name: idx_collections_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_share_token ON public.collections USING btree (share_token);


--
-- Name: idx_collections_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collections_user_id ON public.collections USING btree (user_id);


--
-- Name: idx_import_history_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_history_user_created ON public.import_history USING btree (user_id, created_at DESC);


--
-- Name: idx_import_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_history_user_id ON public.import_history USING btree (user_id);


--
-- Name: idx_import_history_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_history_user_status ON public.import_history USING btree (user_id, status, started_at DESC);


--
-- Name: idx_log_aggregations_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_log_aggregations_period ON public.log_aggregations USING btree (period_start DESC, period_end DESC);


--
-- Name: idx_log_aggregations_type_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_log_aggregations_type_period ON public.log_aggregations USING btree (aggregation_type, period_start DESC);


--
-- Name: idx_log_ai_analysis_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_log_ai_analysis_created ON public.log_ai_analysis USING btree (created_at DESC);


--
-- Name: idx_logs_error; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_error ON public.system_logs USING btree (error_type, "timestamp" DESC) WHERE (error_type IS NOT NULL);


--
-- Name: idx_logs_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_level ON public.system_logs USING btree (level, "timestamp" DESC);


--
-- Name: idx_logs_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_metadata ON public.system_logs USING gin (metadata);


--
-- Name: idx_logs_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_service ON public.system_logs USING btree (service, "timestamp" DESC);


--
-- Name: idx_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_timestamp ON public.system_logs USING btree ("timestamp" DESC);


--
-- Name: idx_problem_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_problem_reports_status ON public.problem_reports USING btree (status);


--
-- Name: idx_system_logs_level_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_logs_level_timestamp ON public.system_logs USING btree (level, "timestamp" DESC);


--
-- Name: idx_system_logs_service_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_logs_service_timestamp ON public.system_logs USING btree (service, "timestamp" DESC);


--
-- Name: idx_system_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_logs_timestamp ON public.system_logs USING btree ("timestamp" DESC);


--
-- Name: idx_system_logs_timestamp_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_logs_timestamp_service ON public.system_logs USING btree ("timestamp", service);


--
-- Name: idx_tags_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_user_id ON public.tags USING btree (user_id);


--
-- Name: idx_test_cases_automated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_cases_automated ON public.test_cases USING btree (automated);


--
-- Name: idx_test_cases_suite_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_cases_suite_id ON public.test_cases USING btree (suite_id);


--
-- Name: idx_test_cases_test_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_cases_test_id ON public.test_cases USING btree (test_id);


--
-- Name: idx_test_executions_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_executions_run_id ON public.test_executions USING btree (run_id);


--
-- Name: idx_test_executions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_executions_started_at ON public.test_executions USING btree (started_at DESC);


--
-- Name: idx_test_executions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_executions_status ON public.test_executions USING btree (status);


--
-- Name: idx_test_executions_test_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_executions_test_case_id ON public.test_executions USING btree (test_case_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: v_active_tasks _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_active_tasks AS
 SELECT t.id,
    t.type,
    t.status,
    t.workflow_type,
    t.current_agent,
    t.current_step,
    t.total_steps,
    round(
        CASE
            WHEN (t.total_steps > 0) THEN (((t.current_step)::numeric / (t.total_steps)::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS progress_percentage,
    t.created,
    t.updated,
    t.user_id,
    count(DISTINCT a.id) AS artifact_count,
    count(DISTINCT m.id) AS message_count
   FROM ((public.a2a_tasks t
     LEFT JOIN public.a2a_artifacts a ON (((t.id)::text = (a.task_id)::text)))
     LEFT JOIN public.a2a_messages m ON (((t.id)::text = (m.task_id)::text)))
  WHERE ((t.status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying])::text[]))
  GROUP BY t.id;


--
-- Name: v_task_history _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_task_history AS
 SELECT t.id,
    t.type,
    t.status,
    t.workflow_type,
    t.created,
    t.updated,
    (t.updated - t.created) AS duration,
    t.user_id,
    u.email AS user_email,
    count(DISTINCT a.id) AS artifact_count,
    count(DISTINCT m.id) AS message_count,
    max(
        CASE
            WHEN ((m.type)::text = 'error'::text) THEN m.content
            ELSE NULL::text
        END) AS last_error
   FROM (((public.a2a_tasks t
     LEFT JOIN public.users u ON ((t.user_id = u.id)))
     LEFT JOIN public.a2a_artifacts a ON (((t.id)::text = (a.task_id)::text)))
     LEFT JOIN public.a2a_messages m ON (((t.id)::text = (m.task_id)::text)))
  GROUP BY t.id, u.email
  ORDER BY t.created DESC;


--
-- Name: test_cases audit_test_cases; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_test_cases AFTER INSERT OR DELETE OR UPDATE ON public.test_cases FOR EACH ROW EXECUTE FUNCTION public.audit_test_changes();


--
-- Name: test_executions audit_test_executions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_test_executions AFTER INSERT OR DELETE OR UPDATE ON public.test_executions FOR EACH ROW EXECUTE FUNCTION public.audit_test_changes();


--
-- Name: test_plans audit_test_plans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_test_plans AFTER INSERT OR DELETE OR UPDATE ON public.test_plans FOR EACH ROW EXECUTE FUNCTION public.audit_test_changes();


--
-- Name: bookmarks trigger_ensure_metadata_for_enriched; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_ensure_metadata_for_enriched AFTER UPDATE OF enriched ON public.bookmarks FOR EACH ROW EXECUTE FUNCTION public.ensure_metadata_for_enriched_bookmarks();


--
-- Name: a2a_tasks trigger_update_task_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_task_timestamp BEFORE UPDATE ON public.a2a_tasks FOR EACH ROW EXECUTE FUNCTION public.update_task_timestamp();


--
-- Name: bookmark_collections update_bookmark_collections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bookmark_collections_updated_at BEFORE UPDATE ON public.bookmark_collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bookmark_metadata update_bookmark_metadata_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bookmark_metadata_updated_at BEFORE UPDATE ON public.bookmark_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bookmark_tags update_bookmark_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bookmark_tags_updated_at BEFORE UPDATE ON public.bookmark_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bookmarks update_bookmarks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bookmarks_updated_at BEFORE UPDATE ON public.bookmarks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: collections update_collections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: import_history update_import_history_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_import_history_updated_at BEFORE UPDATE ON public.import_history FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tags update_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: a2a_artifacts a2a_artifacts_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_artifacts
    ADD CONSTRAINT a2a_artifacts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.a2a_tasks(id) ON DELETE CASCADE;


--
-- Name: a2a_messages a2a_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_messages
    ADD CONSTRAINT a2a_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.a2a_tasks(id) ON DELETE CASCADE;


--
-- Name: a2a_task_progress a2a_task_progress_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_task_progress
    ADD CONSTRAINT a2a_task_progress_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.a2a_tasks(id) ON DELETE CASCADE;


--
-- Name: a2a_tasks a2a_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_tasks
    ADD CONSTRAINT a2a_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bookmark_collections bookmark_collections_bookmark_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_collections
    ADD CONSTRAINT bookmark_collections_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES public.bookmarks(id) ON DELETE CASCADE;


--
-- Name: bookmark_collections bookmark_collections_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_collections
    ADD CONSTRAINT bookmark_collections_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: bookmark_embeddings bookmark_embeddings_bookmark_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_embeddings
    ADD CONSTRAINT bookmark_embeddings_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES public.bookmarks(id) ON DELETE CASCADE;


--
-- Name: bookmark_metadata bookmark_metadata_bookmark_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_metadata
    ADD CONSTRAINT bookmark_metadata_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES public.bookmarks(id) ON DELETE CASCADE;


--
-- Name: bookmark_tags bookmark_tags_bookmark_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_tags
    ADD CONSTRAINT bookmark_tags_bookmark_id_fkey FOREIGN KEY (bookmark_id) REFERENCES public.bookmarks(id) ON DELETE CASCADE;


--
-- Name: bookmark_tags bookmark_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmark_tags
    ADD CONSTRAINT bookmark_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.import_history(id);


--
-- Name: bookmarks bookmarks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: collections collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: import_history import_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_cases test_cases_suite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cases
    ADD CONSTRAINT test_cases_suite_id_fkey FOREIGN KEY (suite_id) REFERENCES public.test_suites(id) ON DELETE CASCADE;


--
-- Name: test_executions test_executions_test_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_executions
    ADD CONSTRAINT test_executions_test_case_id_fkey FOREIGN KEY (test_case_id) REFERENCES public.test_cases(id) ON DELETE CASCADE;


--
-- Name: test_suites test_suites_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_suites
    ADD CONSTRAINT test_suites_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.test_plans(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

