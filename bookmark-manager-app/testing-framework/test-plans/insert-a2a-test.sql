-- Insert A2A Enrichment Test Plan into Database
-- This creates a comprehensive test for the A2A agent workflow

-- First, ensure we have the test tables
-- (Assuming test_suites and test_cases tables exist as per real-test-suites.sql)

BEGIN;

-- Insert A2A Test Suite
INSERT INTO test_suites (id, name, description, category, created_by, enabled) 
VALUES (
    gen_random_uuid(), 
    'A2A Agent Workflow Tests', 
    'Comprehensive tests for A2A Import → Validation → Enrichment → Categorization workflow', 
    'integration', 
    'admin@az1.ai', 
    true
) RETURNING id AS a2a_suite_id \gset

-- Insert A2A Test Case
INSERT INTO test_cases (
    id, 
    suite_id, 
    test_identifier, 
    name, 
    description, 
    category, 
    priority, 
    test_steps, 
    test_data, 
    expected_outcome, 
    enabled, 
    created_by
) VALUES (
    gen_random_uuid(),
    :'a2a_suite_id',
    'TEST-A2A-ENRICHMENT-001',
    'Complete A2A Bookmark Import and Enrichment',
    'Import bookmarks file and verify A2A agents process it correctly through all stages',
    'integration',
    'critical',
    '[
        {
            "stepNumber": 1,
            "stepId": "create-test-user",
            "description": "Create test user for A2A test",
            "action": {
                "type": "databaseQuery",
                "parameters": {
                    "query": "INSERT INTO users (id, email, password_hash, name, role, two_factor_enabled) VALUES (gen_random_uuid(), ''test-a2a-'' || extract(epoch from now())::text || ''@az1.ai'', ''$2b$10$dummy'', ''A2A Test User'', ''user'', false) RETURNING id, email",
                    "storeResult": "testUser"
                }
            },
            "validation": {
                "type": "databaseRecordExists",
                "expected": true
            }
        },
        {
            "stepNumber": 2,
            "stepId": "navigate-to-login",
            "description": "Navigate to login page",
            "action": {
                "type": "navigate",
                "parameters": {
                    "url": "http://localhost:5173/login",
                    "waitUntil": "networkidle",
                    "screenshot": {
                        "path": "screenshots/a2a-01-login-page.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "urlContains",
                "expected": "/login"
            }
        },
        {
            "stepNumber": 3,
            "stepId": "login-test-user",
            "description": "Login as test user",
            "action": {
                "type": "fill",
                "target": {
                    "selector": "input[name=\"email\"]"
                },
                "parameters": {
                    "value": "${testUser.email}"
                }
            }
        },
        {
            "stepNumber": 4,
            "stepId": "enter-password",
            "description": "Enter password",
            "action": {
                "type": "fill",
                "target": {
                    "selector": "input[name=\"password\"]"
                },
                "parameters": {
                    "value": "dummy"
                }
            }
        },
        {
            "stepNumber": 5,
            "stepId": "submit-login",
            "description": "Submit login form",
            "action": {
                "type": "click",
                "target": {
                    "selector": "button[type=\"submit\"]"
                },
                "parameters": {
                    "waitAfter": 3000,
                    "screenshot": {
                        "path": "screenshots/a2a-02-after-login.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "urlContains",
                "expected": "/dashboard"
            }
        },
        {
            "stepNumber": 6,
            "stepId": "navigate-to-a2a-import",
            "description": "Navigate to A2A import page",
            "action": {
                "type": "navigate",
                "parameters": {
                    "url": "http://localhost:5173/import-a2a",
                    "waitUntil": "networkidle",
                    "screenshot": {
                        "path": "screenshots/a2a-03-import-page.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "elementVisible",
                "target": {
                    "selector": "input[type=\"file\"]"
                },
                "expected": true
            }
        },
        {
            "stepNumber": 7,
            "stepId": "upload-bookmark-file",
            "description": "Upload test bookmark file",
            "action": {
                "type": "uploadFile",
                "target": {
                    "selector": "input[type=\"file\"]"
                },
                "parameters": {
                    "filePath": "test-bookmarks-real.html",
                    "waitAfter": 2000,
                    "screenshot": {
                        "path": "screenshots/a2a-04-file-selected.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "textContains",
                "target": {
                    "selector": "body"
                },
                "expected": "test-bookmarks-real.html"
            }
        },
        {
            "stepNumber": 8,
            "stepId": "click-import",
            "description": "Click import button to start A2A workflow",
            "action": {
                "type": "click",
                "target": {
                    "selector": "button:has-text(\"Import\")"
                },
                "parameters": {
                    "waitAfter": 3000,
                    "screenshot": {
                        "path": "screenshots/a2a-05-import-started.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "networkRequestMade",
                "expected": {
                    "url": "/api/import/a2a/upload",
                    "method": "POST"
                }
            }
        },
        {
            "stepNumber": 9,
            "stepId": "monitor-import-progress",
            "description": "Monitor import agent progress",
            "action": {
                "type": "waitForSelector",
                "target": {
                    "selector": "[data-agent=\"import\"][data-status=\"completed\"]"
                },
                "parameters": {
                    "timeout": 30000,
                    "screenshot": {
                        "path": "screenshots/a2a-06-import-complete.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "elementVisible",
                "expected": true
            }
        },
        {
            "stepNumber": 10,
            "stepId": "monitor-validation-progress",
            "description": "Monitor validation agent progress",
            "action": {
                "type": "waitForSelector",
                "target": {
                    "selector": "[data-agent=\"validation\"][data-status=\"completed\"]"
                },
                "parameters": {
                    "timeout": 30000,
                    "screenshot": {
                        "path": "screenshots/a2a-07-validation-complete.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "elementVisible",
                "expected": true
            }
        },
        {
            "stepNumber": 11,
            "stepId": "monitor-enrichment-progress",
            "description": "Monitor enrichment agent progress",
            "action": {
                "type": "waitForSelector",
                "target": {
                    "selector": "[data-agent=\"enrichment\"][data-status=\"completed\"]"
                },
                "parameters": {
                    "timeout": 60000,
                    "screenshot": {
                        "path": "screenshots/a2a-08-enrichment-complete.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "elementVisible",
                "expected": true
            }
        },
        {
            "stepNumber": 12,
            "stepId": "monitor-categorization-progress",
            "description": "Monitor categorization agent progress",
            "action": {
                "type": "waitForSelector",
                "target": {
                    "selector": "[data-agent=\"categorization\"][data-status=\"completed\"]"
                },
                "parameters": {
                    "timeout": 30000,
                    "screenshot": {
                        "path": "screenshots/a2a-09-categorization-complete.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "elementVisible",
                "expected": true
            }
        },
        {
            "stepNumber": 13,
            "stepId": "navigate-to-bookmarks",
            "description": "Navigate to bookmarks page",
            "action": {
                "type": "navigate",
                "parameters": {
                    "url": "http://localhost:5173/bookmarks",
                    "waitUntil": "networkidle",
                    "screenshot": {
                        "path": "screenshots/a2a-10-bookmarks-page.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "urlContains",
                "expected": "/bookmarks"
            }
        },
        {
            "stepNumber": 14,
            "stepId": "verify-bookmarks-exist",
            "description": "Verify bookmarks were imported",
            "action": {
                "type": "waitForSelector",
                "target": {
                    "selector": ".bookmark-card"
                },
                "parameters": {
                    "timeout": 10000
                }
            },
            "validation": {
                "type": "elementCount",
                "target": {
                    "selector": ".bookmark-card"
                },
                "operator": "greaterThan",
                "expected": 0
            }
        },
        {
            "stepNumber": 15,
            "stepId": "verify-enrichment-data",
            "description": "Verify bookmarks have enrichment data",
            "action": {
                "type": "databaseQuery",
                "parameters": {
                    "query": "SELECT COUNT(*) as total, COUNT(CASE WHEN enriched = true THEN 1 END) as enriched_count, COUNT(CASE WHEN category IS NOT NULL THEN 1 END) as categorized_count FROM bookmarks WHERE user_id = ''${testUser.id}''",
                    "storeResult": "enrichmentStats"
                }
            },
            "validation": {
                "type": "customValidation",
                "expected": {
                    "enrichmentRate": 0.8,
                    "categorizationRate": 0.8
                }
            }
        },
        {
            "stepNumber": 16,
            "stepId": "verify-a2a-artifacts",
            "description": "Verify A2A artifacts were created",
            "action": {
                "type": "databaseQuery",
                "parameters": {
                    "query": "SELECT agent_type, COUNT(*) as artifact_count FROM a2a_artifacts WHERE task_id IN (SELECT id FROM a2a_tasks WHERE user_id = ''${testUser.id}'') GROUP BY agent_type",
                    "storeResult": "artifactStats",
                    "screenshot": {
                        "path": "screenshots/a2a-11-final-state.png",
                        "fullPage": true
                    }
                }
            },
            "validation": {
                "type": "customValidation",
                "expected": {
                    "requiredAgents": ["import", "validation", "enrichment", "categorization"]
                }
            }
        }
    ]'::jsonb,
    '{
        "bookmarkFile": "test-bookmarks-real.html",
        "expectedBookmarkCount": 16,
        "expectedAgents": ["import", "validation", "enrichment", "categorization"],
        "testTimeout": 300000
    }'::jsonb,
    'A2A workflow should complete successfully with all bookmarks imported, validated, enriched, and categorized',
    true,
    'admin@az1.ai'
);

-- Create a test run record for this test
INSERT INTO test_runs (
    id,
    suite_id,
    test_case_id,
    run_identifier,
    status,
    started_at,
    created_by
) VALUES (
    gen_random_uuid(),
    :'a2a_suite_id',
    (SELECT id FROM test_cases WHERE test_identifier = 'TEST-A2A-ENRICHMENT-001'),
    'RUN-A2A-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
    'pending',
    now(),
    'admin@az1.ai'
);

COMMIT;

-- Output the test case for verification
SELECT 
    tc.test_identifier,
    tc.name,
    tc.description,
    ts.name as suite_name,
    tc.priority,
    jsonb_array_length(tc.test_steps) as step_count
FROM test_cases tc
JOIN test_suites ts ON tc.suite_id = ts.id
WHERE tc.test_identifier = 'TEST-A2A-ENRICHMENT-001';