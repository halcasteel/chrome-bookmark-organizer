//! Tool Templates Library

use std::collections::HashMap;
use serde::{Serialize, Deserialize};

use crate::{Result, Error};
use super::ToolSpecification;

/// Tool template for quick tool creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: TemplateCategory,
    pub base_specification: ToolSpecification,
    pub parameters: Vec<TemplateParameter>,
    pub examples: Vec<TemplateExample>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TemplateCategory {
    Monitoring,
    DataProcessing,
    APIIntegration,
    Automation,
    Security,
    Analytics,
    Infrastructure,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateParameter {
    pub name: String,
    pub parameter_type: ParameterType,
    pub description: String,
    pub default_value: Option<serde_json::Value>,
    pub required: bool,
    pub validation: Option<ParameterValidation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ParameterType {
    String,
    Number,
    Boolean,
    Choice(Vec<String>),
    Object,
    Array,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterValidation {
    pub min: Option<serde_json::Value>,
    pub max: Option<serde_json::Value>,
    pub pattern: Option<String>,
    pub custom: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateExample {
    pub name: String,
    pub description: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Template library for managing tool templates
pub struct TemplateLibrary {
    templates: HashMap<String, ToolTemplate>,
    categories: HashMap<TemplateCategory, Vec<String>>,
}

impl TemplateLibrary {
    /// Create a new template library
    pub fn new() -> Self {
        let mut library = Self {
            templates: HashMap::new(),
            categories: HashMap::new(),
        };
        
        // Load default templates
        library.load_default_templates();
        
        library
    }
    
    /// Get a template by ID
    pub fn get(&self, template_id: &str) -> Option<&ToolTemplate> {
        self.templates.get(template_id)
    }
    
    /// List templates by category
    pub fn list_by_category(&self, category: &TemplateCategory) -> Vec<&ToolTemplate> {
        self.categories.get(category)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.templates.get(id))
                    .collect()
            })
            .unwrap_or_default()
    }
    
    /// List all templates
    pub fn list_all(&self) -> Vec<&ToolTemplate> {
        self.templates.values().collect()
    }
    
    /// Add a custom template
    pub fn add_template(&mut self, template: ToolTemplate) {
        let template_id = template.id.clone();
        let category = template.category.clone();
        
        self.templates.insert(template_id.clone(), template);
        self.categories.entry(category)
            .or_insert_with(Vec::new)
            .push(template_id);
    }
    
    /// Instantiate a tool from a template
    pub fn instantiate(
        &self,
        template_id: &str,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<ToolSpecification> {
        let template = self.templates.get(template_id)
            .ok_or_else(|| Error::NotFound(format!("Template '{}' not found", template_id)))?;
        
        // Validate parameters
        self.validate_parameters(template, &parameters)?;
        
        // Apply parameters to specification
        let spec = self.apply_parameters(template.base_specification.clone(), &parameters)?;
        
        Ok(spec)
    }
    
    fn validate_parameters(
        &self,
        template: &ToolTemplate,
        provided: &HashMap<String, serde_json::Value>,
    ) -> Result<()> {
        // Check required parameters
        for param in &template.parameters {
            if param.required && !provided.contains_key(&param.name) {
                return Err(Error::Configuration(format!(
                    "Required parameter '{}' not provided",
                    param.name
                )));
            }
            
            // Validate parameter type and constraints
            if let Some(value) = provided.get(&param.name) {
                self.validate_parameter_value(param, value)?;
            }
        }
        
        Ok(())
    }
    
    fn validate_parameter_value(
        &self,
        param: &TemplateParameter,
        value: &serde_json::Value,
    ) -> Result<()> {
        // Type validation
        match &param.parameter_type {
            ParameterType::String => {
                if !value.is_string() {
                    return Err(Error::Configuration(format!(
                        "Parameter '{}' must be a string",
                        param.name
                    )));
                }
            }
            ParameterType::Number => {
                if !value.is_number() {
                    return Err(Error::Configuration(format!(
                        "Parameter '{}' must be a number",
                        param.name
                    )));
                }
            }
            ParameterType::Boolean => {
                if !value.is_boolean() {
                    return Err(Error::Configuration(format!(
                        "Parameter '{}' must be a boolean",
                        param.name
                    )));
                }
            }
            ParameterType::Choice(choices) => {
                if let Some(str_value) = value.as_str() {
                    if !choices.contains(&str_value.to_string()) {
                        return Err(Error::Configuration(format!(
                            "Parameter '{}' must be one of: {:?}",
                            param.name, choices
                        )));
                    }
                }
            }
            _ => {} // Complex types need more sophisticated validation
        }
        
        Ok(())
    }
    
    fn apply_parameters(
        &self,
        mut spec: ToolSpecification,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> Result<ToolSpecification> {
        // Apply parameters to specification
        // This is a simple implementation - real one would be more sophisticated
        
        // Update name if provided
        if let Some(name) = parameters.get("name").and_then(|v| v.as_str()) {
            spec.name = name.to_string();
        }
        
        // Update description if provided
        if let Some(desc) = parameters.get("description").and_then(|v| v.as_str()) {
            spec.description = desc.to_string();
        }
        
        // Store all parameters in metadata for later use
        for (key, value) in parameters {
            spec.metadata.insert(format!("param_{}", key), value.clone());
        }
        
        Ok(spec)
    }
    
    fn load_default_templates(&mut self) {
        // Load built-in templates
        self.add_template(self.create_http_monitor_template());
        self.add_template(self.create_log_analyzer_template());
        self.add_template(self.create_data_transformer_template());
    }
    
    fn create_http_monitor_template(&self) -> ToolTemplate {
        ToolTemplate {
            id: "http-monitor".to_string(),
            name: "HTTP Endpoint Monitor".to_string(),
            description: "Monitor HTTP endpoints for availability and performance".to_string(),
            category: TemplateCategory::Monitoring,
            base_specification: ToolSpecification::new(
                "HTTP Monitor".to_string(),
                super::ToolType::Monitor,
            ),
            parameters: vec![
                TemplateParameter {
                    name: "endpoint_url".to_string(),
                    parameter_type: ParameterType::String,
                    description: "URL to monitor".to_string(),
                    default_value: None,
                    required: true,
                    validation: Some(ParameterValidation {
                        pattern: Some(r"^https?://".to_string()),
                        min: None,
                        max: None,
                        custom: None,
                    }),
                },
                TemplateParameter {
                    name: "check_interval".to_string(),
                    parameter_type: ParameterType::Number,
                    description: "Check interval in seconds".to_string(),
                    default_value: Some(serde_json::json!(60)),
                    required: false,
                    validation: Some(ParameterValidation {
                        min: Some(serde_json::json!(10)),
                        max: Some(serde_json::json!(3600)),
                        pattern: None,
                        custom: None,
                    }),
                },
            ],
            examples: vec![
                TemplateExample {
                    name: "Basic API Monitor".to_string(),
                    description: "Monitor a REST API endpoint".to_string(),
                    parameters: HashMap::from([
                        ("endpoint_url".to_string(), serde_json::json!("https://api.example.com/health")),
                        ("check_interval".to_string(), serde_json::json!(30)),
                    ]),
                },
            ],
        }
    }
    
    fn create_log_analyzer_template(&self) -> ToolTemplate {
        ToolTemplate {
            id: "log-analyzer".to_string(),
            name: "Log Analyzer".to_string(),
            description: "Analyze logs for patterns and anomalies".to_string(),
            category: TemplateCategory::Analytics,
            base_specification: ToolSpecification::new(
                "Log Analyzer".to_string(),
                super::ToolType::Analyzer,
            ),
            parameters: vec![
                TemplateParameter {
                    name: "log_source".to_string(),
                    parameter_type: ParameterType::Choice(vec![
                        "file".to_string(),
                        "stream".to_string(),
                        "api".to_string(),
                    ]),
                    description: "Source of log data".to_string(),
                    default_value: Some(serde_json::json!("file")),
                    required: true,
                    validation: None,
                },
            ],
            examples: vec![],
        }
    }
    
    fn create_data_transformer_template(&self) -> ToolTemplate {
        ToolTemplate {
            id: "data-transformer".to_string(),
            name: "Data Transformer".to_string(),
            description: "Transform data between different formats".to_string(),
            category: TemplateCategory::DataProcessing,
            base_specification: ToolSpecification::new(
                "Data Transformer".to_string(),
                super::ToolType::Transformer,
            ),
            parameters: vec![
                TemplateParameter {
                    name: "input_format".to_string(),
                    parameter_type: ParameterType::String,
                    description: "Input data format".to_string(),
                    default_value: None,
                    required: true,
                    validation: None,
                },
                TemplateParameter {
                    name: "output_format".to_string(),
                    parameter_type: ParameterType::String,
                    description: "Output data format".to_string(),
                    default_value: None,
                    required: true,
                    validation: None,
                },
            ],
            examples: vec![],
        }
    }
}