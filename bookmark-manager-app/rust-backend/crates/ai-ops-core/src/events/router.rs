//! Event routing infrastructure

use super::*;
use std::sync::Arc;
use regex::Regex;
use tracing::{debug, trace};

/// Event router for directing events to appropriate handlers
#[derive(Clone)]
pub struct EventRouter {
    routes: Arc<RwLock<Vec<Route>>>,
    default_handler: Arc<RwLock<Option<Box<dyn EventHandler>>>>,
}

struct Route {
    rule: RoutingRule,
    handler: Box<dyn EventHandler>,
}

/// Routing rule for event matching
#[derive(Debug, Clone)]
pub struct RoutingRule {
    pub name: String,
    pub event_types: Option<Vec<EventType>>,
    pub sources: Option<Vec<AgentId>>,
    pub patterns: Vec<PatternMatcher>,
    pub priority: u32,
}

#[derive(Debug, Clone)]
pub enum PatternMatcher {
    FieldEquals { field: String, value: serde_json::Value },
    FieldMatches { field: String, regex: String },
    FieldContains { field: String, value: String },
    FieldExists { field: String },
    Custom(Box<dyn CustomMatcher>),
}

pub trait CustomMatcher: Send + Sync {
    fn matches(&self, event: &Event) -> bool;
    fn clone_box(&self) -> Box<dyn CustomMatcher>;
}

impl Clone for Box<dyn CustomMatcher> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

impl std::fmt::Debug for Box<dyn CustomMatcher> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CustomMatcher").finish()
    }
}

impl EventRouter {
    pub fn new() -> Self {
        Self {
            routes: Arc::new(RwLock::new(Vec::new())),
            default_handler: Arc::new(RwLock::new(None)),
        }
    }
    
    /// Add a routing rule
    pub async fn add_route(&self, rule: RoutingRule, handler: Box<dyn EventHandler>) -> Result<()> {
        let mut routes = self.routes.write().await;
        
        debug!("Adding route: {} with priority {}", rule.name, rule.priority);
        
        routes.push(Route { rule, handler });
        
        // Sort by priority (higher priority first)
        routes.sort_by(|a, b| b.rule.priority.cmp(&a.rule.priority));
        
        Ok(())
    }
    
    /// Set default handler for unmatched events
    pub async fn set_default_handler(&self, handler: Box<dyn EventHandler>) {
        let mut default = self.default_handler.write().await;
        *default = Some(handler);
    }
    
    /// Route an event to appropriate handlers
    pub async fn route(&self, event: &Event) -> Result<()> {
        let routes = self.routes.read().await;
        let mut handled = false;
        
        trace!(
            event_id = %event.id,
            event_type = ?event.event_type,
            "Routing event"
        );
        
        for route in routes.iter() {
            if self.matches_rule(&route.rule, event) {
                debug!(
                    event_id = %event.id,
                    route = %route.rule.name,
                    "Event matched route"
                );
                
                route.handler.handle(event).await?;
                handled = true;
                
                // Continue routing to allow multiple handlers
            }
        }
        
        if !handled {
            let default = self.default_handler.read().await;
            if let Some(ref handler) = *default {
                debug!(
                    event_id = %event.id,
                    "Routing to default handler"
                );
                handler.handle(event).await?;
            } else {
                trace!(
                    event_id = %event.id,
                    "No matching routes or default handler"
                );
            }
        }
        
        Ok(())
    }
    
    /// Get all routes
    pub async fn get_routes(&self) -> Vec<RoutingRule> {
        let routes = self.routes.read().await;
        routes.iter().map(|r| r.rule.clone()).collect()
    }
    
    /// Remove a route by name
    pub async fn remove_route(&self, name: &str) -> Result<()> {
        let mut routes = self.routes.write().await;
        routes.retain(|r| r.rule.name != name);
        Ok(())
    }
    
    /// Clear all routes
    pub async fn clear_routes(&self) -> Result<()> {
        let mut routes = self.routes.write().await;
        routes.clear();
        Ok(())
    }
    
    fn matches_rule(&self, rule: &RoutingRule, event: &Event) -> bool {
        // Check event types
        if let Some(ref types) = rule.event_types {
            if !types.contains(&event.event_type) {
                return false;
            }
        }
        
        // Check sources
        if let Some(ref sources) = rule.sources {
            if !sources.contains(&event.source) {
                return false;
            }
        }
        
        // Check patterns
        for pattern in &rule.patterns {
            if !self.matches_pattern(pattern, event) {
                return false;
            }
        }
        
        true
    }
    
    fn matches_pattern(&self, pattern: &PatternMatcher, event: &Event) -> bool {
        match pattern {
            PatternMatcher::FieldEquals { field, value } => {
                if let Some(event_value) = self.get_field_value(event, field) {
                    &event_value == value
                } else {
                    false
                }
            }
            
            PatternMatcher::FieldMatches { field, regex } => {
                if let Ok(re) = Regex::new(regex) {
                    if let Some(serde_json::Value::String(text)) = self.get_field_value(event, field) {
                        re.is_match(&text)
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            
            PatternMatcher::FieldContains { field, value } => {
                if let Some(serde_json::Value::String(text)) = self.get_field_value(event, field) {
                    text.contains(value)
                } else {
                    false
                }
            }
            
            PatternMatcher::FieldExists { field } => {
                self.get_field_value(event, field).is_some()
            }
            
            PatternMatcher::Custom(matcher) => {
                matcher.matches(event)
            }
        }
    }
    
    fn get_field_value(&self, event: &Event, field: &str) -> Option<serde_json::Value> {
        // Convert event to JSON for field access
        let event_json = serde_json::to_value(event).ok()?;
        
        // Support nested field access with dot notation
        let parts: Vec<&str> = field.split('.').collect();
        let mut current = event_json;
        
        for part in parts {
            match current {
                serde_json::Value::Object(mut map) => {
                    current = map.remove(part)?;
                }
                _ => return None,
            }
        }
        
        Some(current)
    }
}

/// Builder for routing rules
pub struct RoutingRuleBuilder {
    rule: RoutingRule,
}

impl RoutingRuleBuilder {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            rule: RoutingRule {
                name: name.into(),
                event_types: None,
                sources: None,
                patterns: Vec::new(),
                priority: 100,
            },
        }
    }
    
    pub fn event_types(mut self, types: Vec<EventType>) -> Self {
        self.rule.event_types = Some(types);
        self
    }
    
    pub fn sources(mut self, sources: Vec<AgentId>) -> Self {
        self.rule.sources = Some(sources);
        self
    }
    
    pub fn pattern(mut self, pattern: PatternMatcher) -> Self {
        self.rule.patterns.push(pattern);
        self
    }
    
    pub fn priority(mut self, priority: u32) -> Self {
        self.rule.priority = priority;
        self
    }
    
    pub fn build(self) -> RoutingRule {
        self.rule
    }
}

/// Composite event handler that chains multiple handlers
pub struct CompositeHandler {
    handlers: Vec<Box<dyn EventHandler>>,
}

impl CompositeHandler {
    pub fn new(handlers: Vec<Box<dyn EventHandler>>) -> Self {
        Self { handlers }
    }
}

#[async_trait]
impl EventHandler for CompositeHandler {
    async fn handle(&self, event: &Event) -> Result<()> {
        for handler in &self.handlers {
            handler.handle(event).await?;
        }
        Ok(())
    }
    
    fn event_types(&self) -> Vec<EventType> {
        // Return union of all handler event types
        let mut types = Vec::new();
        for handler in &self.handlers {
            types.extend(handler.event_types());
        }
        types.sort();
        types.dedup();
        types
    }
}

/// Conditional handler that only processes events matching a condition
pub struct ConditionalHandler<H> {
    condition: Box<dyn Fn(&Event) -> bool + Send + Sync>,
    handler: H,
}

impl<H: EventHandler> ConditionalHandler<H> {
    pub fn new(
        condition: impl Fn(&Event) -> bool + Send + Sync + 'static,
        handler: H,
    ) -> Self {
        Self {
            condition: Box::new(condition),
            handler,
        }
    }
}

#[async_trait]
impl<H: EventHandler> EventHandler for ConditionalHandler<H> {
    async fn handle(&self, event: &Event) -> Result<()> {
        if (self.condition)(event) {
            self.handler.handle(event).await
        } else {
            Ok(())
        }
    }
    
    fn event_types(&self) -> Vec<EventType> {
        self.handler.event_types()
    }
}

/// Transforming handler that modifies events before passing to inner handler
pub struct TransformingHandler<H> {
    transformer: Box<dyn Fn(Event) -> Result<Event> + Send + Sync>,
    handler: H,
}

impl<H: EventHandler> TransformingHandler<H> {
    pub fn new(
        transformer: impl Fn(Event) -> Result<Event> + Send + Sync + 'static,
        handler: H,
    ) -> Self {
        Self {
            transformer: Box::new(transformer),
            handler,
        }
    }
}

#[async_trait]
impl<H: EventHandler> EventHandler for TransformingHandler<H> {
    async fn handle(&self, event: &Event) -> Result<()> {
        let transformed = (self.transformer)(event.clone())?;
        self.handler.handle(&transformed).await
    }
    
    fn event_types(&self) -> Vec<EventType> {
        self.handler.event_types()
    }
}