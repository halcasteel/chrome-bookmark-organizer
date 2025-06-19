//! Tool Validation Framework

use std::collections::HashMap;
use serde::{Serialize, Deserialize};

use crate::{Result, Error};
use super::{ToolSpecification, ToolArtifact};

/// Tool validator
pub struct ToolValidator {
    validators: Vec<Box<dyn Validator>>,
}

impl ToolValidator {
    /// Create a new tool validator
    pub fn new() -> Self {
        Self {
            validators: vec![
                Box::new(SpecificationValidator::new()),
                Box::new(InterfaceValidator::new()),
                Box::new(BehaviorValidator::new()),
                Box::new(SecurityValidator::new()),
                Box::new(PerformanceValidator::new()),
            ],
        }
    }
    
    /// Validate a tool specification
    pub async fn validate_specification(
        &self,
        spec: &ToolSpecification,
    ) -> Result<ValidationResult> {
        let mut issues = Vec::new();
        let mut warnings = Vec::new();
        
        for validator in &self.validators {
            let result = validator.validate_spec(spec)?;
            issues.extend(result.issues);
            warnings.extend(result.warnings);
        }
        
        let valid = issues.is_empty();
        let suggestions = self.generate_suggestions(&issues);
        
        Ok(ValidationResult {
            valid,
            issues,
            warnings,
            suggestions,
        })
    }
    
    /// Validate a built tool artifact
    pub async fn validate_artifact(
        &self,
        artifact: &ToolArtifact,
    ) -> Result<ValidationResult> {
        let mut issues = Vec::new();
        let mut warnings = Vec::new();
        
        // Validate specification matches artifact
        if artifact.specification.name.is_empty() {
            issues.push(ValidationIssue {
                severity: Severity::Error,
                category: IssueCategory::Specification,
                message: "Tool name is empty".to_string(),
                location: Some("specification.name".to_string()),
            });
        }
        
        // Validate code
        if artifact.code.files.is_empty() {
            issues.push(ValidationIssue {
                severity: Severity::Error,
                category: IssueCategory::Code,
                message: "No code files generated".to_string(),
                location: None,
            });
        }
        
        // Validate tests
        if artifact.tests.unit_tests.is_empty() && artifact.tests.integration_tests.is_empty() {
            warnings.push(ValidationIssue {
                severity: Severity::Warning,
                category: IssueCategory::Testing,
                message: "No tests generated".to_string(),
                location: None,
            });
        }
        
        Ok(ValidationResult {
            valid: issues.is_empty(),
            issues,
            warnings,
            suggestions: vec![],
        })
    }
    
    fn generate_suggestions(&self, issues: &[ValidationIssue]) -> Vec<String> {
        let mut suggestions = Vec::new();
        
        for issue in issues {
            match issue.category {
                IssueCategory::Interface => {
                    suggestions.push("Consider adding input validation rules".to_string());
                }
                IssueCategory::Security => {
                    suggestions.push("Review security best practices for your tool type".to_string());
                }
                IssueCategory::Performance => {
                    suggestions.push("Consider adding resource limits and timeouts".to_string());
                }
                _ => {}
            }
        }
        
        suggestions.dedup();
        suggestions
    }
}

/// Validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub issues: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationIssue {
    pub severity: Severity,
    pub category: IssueCategory,
    pub message: String,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IssueCategory {
    Specification,
    Interface,
    Behavior,
    Security,
    Performance,
    Code,
    Testing,
    Documentation,
}

/// Trait for validators
trait Validator: Send + Sync {
    fn validate_spec(&self, spec: &ToolSpecification) -> Result<ValidationResult>;
}

/// Specification validator
struct SpecificationValidator;

impl SpecificationValidator {
    fn new() -> Self {
        Self
    }
}

impl Validator for SpecificationValidator {
    fn validate_spec(&self, spec: &ToolSpecification) -> Result<ValidationResult> {
        let mut issues = Vec::new();
        let warnings = Vec::new();
        
        // Validate basic fields
        if spec.name.is_empty() {
            issues.push(ValidationIssue {
                severity: Severity::Error,
                category: IssueCategory::Specification,
                message: "Tool name cannot be empty".to_string(),
                location: Some("name".to_string()),
            });
        }
        
        if spec.description.is_empty() {
            issues.push(ValidationIssue {
                severity: Severity::Warning,
                category: IssueCategory::Specification,
                message: "Tool description is empty".to_string(),
                location: Some("description".to_string()),
            });
        }
        
        Ok(ValidationResult {
            valid: issues.is_empty(),
            issues,
            warnings,
            suggestions: vec![],
        })
    }
}

/// Interface validator
struct InterfaceValidator;

impl InterfaceValidator {
    fn new() -> Self {
        Self
    }
}

impl Validator for InterfaceValidator {
    fn validate_spec(&self, spec: &ToolSpecification) -> Result<ValidationResult> {
        let mut issues = Vec::new();
        let mut warnings = Vec::new();
        
        // Validate inputs
        if spec.interface.inputs.is_empty() && spec.interface.events.is_empty() {
            warnings.push(ValidationIssue {
                severity: Severity::Warning,
                category: IssueCategory::Interface,
                message: "Tool has no inputs or event triggers".to_string(),
                location: Some("interface".to_string()),
            });
        }
        
        // Check for duplicate field names
        let mut field_names = std::collections::HashSet::new();
        for input in &spec.interface.inputs {
            if !field_names.insert(&input.name) {
                issues.push(ValidationIssue {
                    severity: Severity::Error,
                    category: IssueCategory::Interface,
                    message: format!("Duplicate input field name: {}", input.name),
                    location: Some(format!("interface.inputs.{}", input.name)),
                });
            }
        }
        
        Ok(ValidationResult {
            valid: issues.is_empty(),
            issues,
            warnings,
            suggestions: vec![],
        })
    }
}

/// Behavior validator
struct BehaviorValidator;

impl BehaviorValidator {
    fn new() -> Self {
        Self
    }
}

impl Validator for BehaviorValidator {
    fn validate_spec(&self, spec: &ToolSpecification) -> Result<ValidationResult> {
        let issues = Vec::new();
        let mut warnings = Vec::new();
        
        // Validate triggers and actions
        if spec.behavior.triggers.is_empty() {
            warnings.push(ValidationIssue {
                severity: Severity::Warning,
                category: IssueCategory::Behavior,
                message: "No triggers defined".to_string(),
                location: Some("behavior.triggers".to_string()),
            });
        }
        
        if spec.behavior.actions.is_empty() {
            warnings.push(ValidationIssue {
                severity: Severity::Warning,
                category: IssueCategory::Behavior,
                message: "No actions defined".to_string(),
                location: Some("behavior.actions".to_string()),
            });
        }
        
        Ok(ValidationResult {
            valid: issues.is_empty(),
            issues,
            warnings,
            suggestions: vec![],
        })
    }
}

/// Security validator
struct SecurityValidator;

impl SecurityValidator {
    fn new() -> Self {
        Self
    }
}

impl Validator for SecurityValidator {
    fn validate_spec(&self, spec: &ToolSpecification) -> Result<ValidationResult> {
        let issues = Vec::new();
        let mut warnings = Vec::new();
        
        // Check for required permissions
        if spec.requirements.permissions.is_empty() {
            warnings.push(ValidationIssue {
                severity: Severity::Info,
                category: IssueCategory::Security,
                message: "No permissions specified - tool will run with minimal privileges".to_string(),
                location: Some("requirements.permissions".to_string()),
            });
        }
        
        // Check for sensitive operations
        for action in &spec.behavior.actions {
            if action.name.contains("delete") || action.name.contains("remove") {
                warnings.push(ValidationIssue {
                    severity: Severity::Warning,
                    category: IssueCategory::Security,
                    message: format!("Destructive action detected: {}", action.name),
                    location: Some(format!("behavior.actions.{}", action.name)),
                });
            }
        }
        
        Ok(ValidationResult {
            valid: issues.is_empty(),
            issues,
            warnings,
            suggestions: vec![],
        })
    }
}

/// Performance validator
struct PerformanceValidator;

impl PerformanceValidator {
    fn new() -> Self {
        Self
    }
}

impl Validator for PerformanceValidator {
    fn validate_spec(&self, spec: &ToolSpecification) -> Result<ValidationResult> {
        let issues = Vec::new();
        let mut warnings = Vec::new();
        
        // Check resource requirements
        if spec.requirements.resources.cpu.is_none() &&
           spec.requirements.resources.memory.is_none() {
            warnings.push(ValidationIssue {
                severity: Severity::Info,
                category: IssueCategory::Performance,
                message: "No resource limits specified".to_string(),
                location: Some("requirements.resources".to_string()),
            });
        }
        
        // Check for scaling configuration
        if spec.deployment.scaling.min_instances == 0 {
            warnings.push(ValidationIssue {
                severity: Severity::Warning,
                category: IssueCategory::Performance,
                message: "Minimum instances set to 0 - tool may not be available".to_string(),
                location: Some("deployment.scaling.min_instances".to_string()),
            });
        }
        
        Ok(ValidationResult {
            valid: issues.is_empty(),
            issues,
            warnings,
            suggestions: vec![],
        })
    }
}