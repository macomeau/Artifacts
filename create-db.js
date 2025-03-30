const db = require('./db');                                
                                                            
async function initialize() {                              
  try {                                                    
    await db.createTables();                               
    console.log('✅ Database tables created successfully') 
    process.exit(0);                                       
  } catch (error) {                                        
    console.error('❌ Database initialization failed:',    
error);                                                    
    process.exit(1);                                       
  }                                                        
}                                                          
                                                           
initialize(); 