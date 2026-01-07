import React from "react"

class PropertyStats extends React.Component{

  constructor(props){
    super(props)
    this.state = {

    }
  }


  render(){

        let name = ""

        let value = ""

        let owner = ""

      if (this.props.property){
        name = this.props.property.name

        value = this.props.property.value

        if (this.props.property.owner){
         owner = this.props.property.owner.name
        }
    }

    return(
      <div>
        <h5>Current Property: {name}</h5>
        <div style={{float: "left"}}><h5>Price: {value}</h5></div>         
        <div style={{float: "right"}}><h5>Owner: {owner}</h5></div>
      </div>
    )
  }

}

export default PropertyStats