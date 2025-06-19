use actix_web::{HttpRequest, HttpResponse};

pub async fn serve_frontend(_req: HttpRequest) -> HttpResponse {
    // For now, return a simple message
    // Later this will serve the React frontend
    HttpResponse::Ok().content_type("text/html").body(
        r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bookmarks Platform</title>
            </head>
            <body>
                <h1>Bookmarks Platform API Gateway</h1>
                <p>Frontend will be served here</p>
                <p>API endpoints available at /api/*</p>
            </body>
            </html>
        "#,
    )
}
