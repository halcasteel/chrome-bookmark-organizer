use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, Validate, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,

    #[validate(email)]
    pub email: String,

    #[serde(skip_serializing)]
    pub password_hash: String,

    pub role: String, // 'user' or 'admin'
    pub two_factor_enabled: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_factor_secret: Option<String>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateUserDto {
    #[validate(email)]
    pub email: String,

    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDto {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub two_factor_enabled: bool,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserDto {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            role: user.role,
            two_factor_enabled: user.two_factor_enabled,
            created_at: user.created_at,
        }
    }
}
