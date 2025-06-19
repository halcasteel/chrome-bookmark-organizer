//! Service agent implementation

use super::*;
use crate::AgentId;

/// Service monitoring and management agent
pub struct ServiceAgent {
    id: AgentId,
    base: BaseAgent,
}

impl ServiceAgent {
    pub fn new(id: AgentId) -> Self {
        Self {
            id,
            base: BaseAgent::new(
                format!("service-agent-{}", id),
                AgentType::ServiceManager
            ),
        }
    }
}